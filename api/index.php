<?php
set_error_handler(function($no, $str, $file, $line) {
    @http_response_code(500);
    @header('Content-Type: application/json');
    echo json_encode(['error' => $str, 'file' => basename($file), 'line' => $line]);
    exit;
});
set_exception_handler(function($e) {
    @http_response_code(500);
    @header('Content-Type: application/json');
    echo json_encode(['error' => $e->getMessage()]);
    exit;
});

require_once __DIR__ . '/../config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

$method   = $_GET['_method'] ?? $_SERVER['REQUEST_METHOD'];
$path     = trim($_GET['path'] ?? '', '/');
$parts    = explode('/', $path);
$resource = $parts[0] ?? '';
$id       = isset($parts[1]) ? (int)$parts[1] : null;

switch ($resource) {
    case 'stats':        handleStats();                   break;
    case 'cards':        handleCards($method, $id);       break;
    case 'transactions': handleTransactions($method, $id); break;
    default:             jsonResponse(['error' => 'Not found'], 404);
}

function fetchAll($db, $sql) {
    $r = $db->query($sql);
    if (!$r) jsonResponse(['error' => $db->error], 500);
    $rows = [];
    while ($row = $r->fetch_assoc()) $rows[] = $row;
    return $rows;
}

function fetchOne($db, $sql) {
    $r = $db->query($sql);
    if (!$r) jsonResponse(['error' => $db->error], 500);
    return $r->fetch_assoc();
}

function fetchVal($db, $sql) {
    $r = $db->query($sql);
    if (!$r) return 0;
    $row = $r->fetch_row();
    return $row ? $row[0] : 0;
}

// ─── STATS ────────────────────────────────────────────────────────────────────
function handleStats() {
    $db = getDB();
    jsonResponse([
        'total_cost'    => (float)fetchVal($db, "SELECT COALESCE(SUM(price*qty),0) FROM transactions WHERE type='buy'"),
        'total_revenue' => (float)fetchVal($db, "SELECT COALESCE(SUM(price*qty),0) FROM transactions WHERE type='sell'"),
        'total_profit'  => (float)fetchVal($db, "SELECT COALESCE(SUM(profit),0)    FROM transactions WHERE type='sell'"),
        'total_bought'  => (int)  fetchVal($db, "SELECT COALESCE(SUM(qty),0)       FROM transactions WHERE type='buy'"),
        'total_sold'    => (int)  fetchVal($db, "SELECT COALESCE(SUM(qty),0)       FROM transactions WHERE type='sell'"),
        'stock_value'   => (float)fetchVal($db, "SELECT COALESCE(SUM(cost*qty),0)  FROM cards WHERE qty>0"),
        'market_value'  => (float)fetchVal($db, "SELECT COALESCE(SUM(CASE WHEN market_price>0 THEN market_price*qty ELSE cost*qty END),0) FROM cards WHERE qty>0"),
        'stock_count'   => (int)  fetchVal($db, "SELECT COALESCE(SUM(qty),0)       FROM cards WHERE qty>0"),
        'unrealized'    => (float)fetchVal($db, "SELECT COALESCE(SUM(CASE WHEN market_price>0 THEN market_price*qty ELSE cost*qty END),0) FROM cards WHERE qty>0")
                         - (float)fetchVal($db, "SELECT COALESCE(SUM(cost*qty),0)  FROM cards WHERE qty>0"),
    ]);
}

// ─── CARDS ────────────────────────────────────────────────────────────────────
function handleCards($method, $id) {
    $db = getDB();

    if ($method === 'GET') {
        $search = $db->real_escape_string($_GET['q'] ?? '');
        if ($search) {
            $sql = "SELECT * FROM cards WHERE qty>0 AND (name LIKE '%$search%' OR card_no LIKE '%$search%') ORDER BY (CASE WHEN market_price>0 THEN market_price ELSE cost END) DESC";
        } else {
            $sql = "SELECT * FROM cards WHERE qty>0 ORDER BY (CASE WHEN market_price>0 THEN market_price ELSE cost END) DESC";
        }
        jsonResponse(fetchAll($db, $sql));
    }

    if ($method === 'POST') {
        $d      = getInput();
        $name   = trim($d['name']         ?? '');
        $cardNo = trim($d['card_no']       ?? '');
        $set    = trim($d['card_set']      ?? '');
        $rarity = $d['rarity']             ?? '';
        $cost   = (float)($d['cost']       ?? 0);
        $qty    = (int)($d['qty']          ?? 1);
        $market = (float)($d['market_price'] ?? 0);

        if (!$name)   jsonResponse(['error' => 'กรุณาระบุชื่อการ์ด'], 400);
        if ($qty < 1) jsonResponse(['error' => 'จำนวนต้องมากกว่า 0'],  400);

        $eName   = $db->real_escape_string($name);
        $eNo     = $db->real_escape_string($cardNo);
        $eSet    = $db->real_escape_string($set);
        $eRarity = $db->real_escape_string($rarity);

        $existing = fetchOne($db, "SELECT id,qty,cost FROM cards WHERE name='$eName' AND card_no='$eNo' AND card_set='$eSet' LIMIT 1");

        if ($existing) {
            $newQty  = $existing['qty'] + $qty;
            $newCost = round((($existing['cost'] * $existing['qty']) + ($cost * $qty)) / $newQty, 2);
            $mktSql  = $market > 0 ? "$market" : "market_price";
            $db->query("UPDATE cards SET qty=$newQty,cost=$newCost,market_price=$mktSql WHERE id={$existing['id']}");
            $cardId  = $existing['id'];
        } else {
            $db->query("INSERT INTO cards (name,card_no,card_set,rarity,cost,qty,market_price) VALUES ('$eName','$eNo','$eSet','$eRarity',$cost,$qty,$market)");
            if ($db->error) jsonResponse(['error' => $db->error], 500);
            $cardId = $db->insert_id;
        }

        $db->query("INSERT INTO transactions (card_id,card_name,type,price,qty) VALUES ($cardId,'$eName','buy',$cost,$qty)");
        jsonResponse(['success' => true, 'card_id' => $cardId]);
    }

    if ($method === 'PUT' && $id) {
        $d = getInput(); $parts = [];

        if (array_key_exists('name',         $d)) $parts[] = "name='"         . $db->real_escape_string(trim($d['name']))    . "'";
        if (array_key_exists('card_set',     $d)) $parts[] = "card_set='"     . $db->real_escape_string(trim($d['card_set'])) . "'";
        if (array_key_exists('card_no',      $d)) $parts[] = "card_no='"      . $db->real_escape_string(trim($d['card_no']))  . "'";
        if (array_key_exists('rarity',       $d)) $parts[] = "rarity='"       . $db->real_escape_string($d['rarity'])         . "'";
        if (array_key_exists('cost',         $d)) $parts[] = "cost="          . (float)$d['cost'];
        if (array_key_exists('qty',          $d)) $parts[] = "qty="           . max(0, (int)$d['qty']);
        if (array_key_exists('market_price', $d)) $parts[] = "market_price="  . (float)$d['market_price'];

        if (empty($parts)) jsonResponse(['success' => true]);
        if (isset($d['name']) && !trim($d['name'])) jsonResponse(['error' => 'กรุณาระบุชื่อการ์ด'], 400);

        $db->query("UPDATE cards SET " . implode(',', $parts) . " WHERE id=$id");
        if ($db->error) jsonResponse(['error' => $db->error], 500);
        jsonResponse(['success' => true]);
    }

    if ($method === 'DELETE' && $id) {
        $db->query("DELETE FROM cards WHERE id=$id");
        jsonResponse(['success' => true]);
    }
}

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────
function handleTransactions($method, $id) {
    $db = getDB();

    if ($method === 'GET') {
        $limit = (int)($_GET['limit'] ?? 50);
        $type  = $db->real_escape_string($_GET['type'] ?? '');
        $where = $type ? "WHERE type='$type'" : '';
        jsonResponse(fetchAll($db, "SELECT * FROM transactions $where ORDER BY created_at DESC LIMIT $limit"));
    }

    if ($method === 'POST') {
        $d      = getInput();
        $cardId = (int)($d['card_id'] ?? 0);
        $price  = (float)($d['price'] ?? 0);
        $qty    = (int)($d['qty']     ?? 1);

        if (!$cardId || !$price || $qty < 1) jsonResponse(['error' => 'ข้อมูลไม่ครบ'], 400);

        $c = fetchOne($db, "SELECT * FROM cards WHERE id=$cardId AND qty>=$qty LIMIT 1");
        if (!$c) jsonResponse(['error' => 'ไม่พบการ์ดหรือสต็อกไม่พอ'], 400);

        $profit   = round(($price - $c['cost']) * $qty, 2);
        $cardName = $db->real_escape_string($c['name']);

        $db->query("UPDATE cards SET qty=qty-$qty WHERE id=$cardId");
        $db->query("INSERT INTO transactions (card_id,card_name,type,price,qty,cost_each,profit) VALUES ($cardId,'$cardName','sell',$price,$qty,{$c['cost']},$profit)");
        jsonResponse(['success' => true, 'profit' => $profit]);
    }
}

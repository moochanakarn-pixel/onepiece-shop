<?php
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

$method   = $_SERVER['REQUEST_METHOD'];
$path     = trim($_GET['path'] ?? '', '/');
$parts    = explode('/', $path);
$resource = $parts[0] ?? '';
$id       = isset($parts[1]) ? (int)$parts[1] : null;

switch ($resource) {
    case 'stats':        handleStats();                  break;
    case 'cards':        handleCards($method, $id);      break;
    case 'transactions': handleTransactions($method, $id); break;
    default:             jsonResponse(['error' => 'Not found'], 404);
}

// ─── STATS ────────────────────────────────────────────────────────────────────
function handleStats() {
    $db = getDB();

    $totalCost    = $db->query("SELECT COALESCE(SUM(price*qty),0) FROM transactions WHERE type='buy'")->fetch_row()[0];
    $totalRevenue = $db->query("SELECT COALESCE(SUM(price*qty),0) FROM transactions WHERE type='sell'")->fetch_row()[0];
    $totalProfit  = $db->query("SELECT COALESCE(SUM(profit),0)   FROM transactions WHERE type='sell'")->fetch_row()[0];
    $totalBought  = $db->query("SELECT COALESCE(SUM(qty),0)      FROM transactions WHERE type='buy'")->fetch_row()[0];
    $totalSold    = $db->query("SELECT COALESCE(SUM(qty),0)      FROM transactions WHERE type='sell'")->fetch_row()[0];
    $stockValue   = $db->query("SELECT COALESCE(SUM(cost*qty),0) FROM cards WHERE qty>0")->fetch_row()[0];
    $marketValue  = $db->query("SELECT COALESCE(SUM(CASE WHEN market_price>0 THEN market_price*qty ELSE cost*qty END),0) FROM cards WHERE qty>0")->fetch_row()[0];
    $stockCount   = $db->query("SELECT COALESCE(SUM(qty),0)      FROM cards WHERE qty>0")->fetch_row()[0];

    jsonResponse([
        'total_cost'    => (float)$totalCost,
        'total_revenue' => (float)$totalRevenue,
        'total_profit'  => (float)$totalProfit,
        'total_bought'  => (int)$totalBought,
        'total_sold'    => (int)$totalSold,
        'stock_value'   => (float)$stockValue,
        'market_value'  => (float)$marketValue,
        'stock_count'   => (int)$stockCount,
        'unrealized'    => (float)$marketValue - (float)$stockValue,
    ]);
}

// ─── CARDS ────────────────────────────────────────────────────────────────────
function handleCards($method, $id) {
    $db = getDB();

    if ($method === 'GET') {
        $search = $_GET['q'] ?? '';
        if ($search) {
            $like = '%' . $search . '%';
            $stmt = $db->prepare("SELECT * FROM cards WHERE qty>0 AND (name LIKE ? OR card_no LIKE ?) ORDER BY (CASE WHEN market_price>0 THEN market_price ELSE cost END) DESC");
            $stmt->bind_param('ss', $like, $like);
            $stmt->execute();
            jsonResponse($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        } else {
            $r = $db->query("SELECT * FROM cards WHERE qty>0 ORDER BY (CASE WHEN market_price>0 THEN market_price ELSE cost END) DESC");
            jsonResponse($r->fetch_all(MYSQLI_ASSOC));
        }
    }

    if ($method === 'POST') {
        $d      = getInput();
        $name   = trim($d['name']   ?? '');
        $cardNo = trim($d['card_no'] ?? '');
        $set    = trim($d['card_set'] ?? '');
        $rarity = $d['rarity'] ?? '';
        $cost   = (float)($d['cost']   ?? 0);
        $qty    = (int)($d['qty']    ?? 1);
        $market = (float)($d['market_price'] ?? 0);

        if (!$name)   jsonResponse(['error' => 'กรุณาระบุชื่อการ์ด'], 400);
        if ($qty < 1) jsonResponse(['error' => 'จำนวนต้องมากกว่า 0'],  400);

        $stmt = $db->prepare("SELECT id,qty,cost FROM cards WHERE name=? AND card_no=? AND card_set=? LIMIT 1");
        $stmt->bind_param('sss', $name, $cardNo, $set);
        $stmt->execute();
        $existing = $stmt->get_result()->fetch_assoc();

        if ($existing) {
            $newQty  = $existing['qty'] + $qty;
            $newCost = (($existing['cost'] * $existing['qty']) + ($cost * $qty)) / $newQty;
            $stmt = $db->prepare("UPDATE cards SET qty=?,cost=?,market_price=IF(?>0,?,market_price) WHERE id=?");
            $stmt->bind_param('idddi', $newQty, $newCost, $market, $market, $existing['id']);
            $stmt->execute();
            $cardId = $existing['id'];
        } else {
            $stmt = $db->prepare("INSERT INTO cards (name,card_no,card_set,rarity,cost,qty,market_price) VALUES (?,?,?,?,?,?,?)");
            $stmt->bind_param('ssssdid', $name, $cardNo, $set, $rarity, $cost, $qty, $market);
            $stmt->execute();
            $cardId = $db->insert_id;
        }

        $stmt = $db->prepare("INSERT INTO transactions (card_id,card_name,type,price,qty) VALUES (?,?,'buy',?,?)");
        $stmt->bind_param('isdi', $cardId, $name, $cost, $qty);
        $stmt->execute();

        jsonResponse(['success' => true, 'card_id' => $cardId]);
    }

    if ($method === 'PUT' && $id) {
        $d = getInput(); $fields = []; $params = []; $types = '';

        if (array_key_exists('name',         $d)) { $fields[]='name=?';         $params[]=trim($d['name']);           $types.='s'; }
        if (array_key_exists('card_set',     $d)) { $fields[]='card_set=?';     $params[]=trim($d['card_set']);       $types.='s'; }
        if (array_key_exists('card_no',      $d)) { $fields[]='card_no=?';      $params[]=trim($d['card_no']);        $types.='s'; }
        if (array_key_exists('rarity',       $d)) { $fields[]='rarity=?';       $params[]=$d['rarity'];               $types.='s'; }
        if (array_key_exists('cost',         $d)) { $fields[]='cost=?';         $params[]=(float)$d['cost'];          $types.='d'; }
        if (array_key_exists('qty',          $d)) { $fields[]='qty=?';          $params[]=max(0,(int)$d['qty']);      $types.='i'; }
        if (array_key_exists('market_price', $d)) { $fields[]='market_price=?'; $params[]=(float)$d['market_price'];  $types.='d'; }

        if (empty($fields)) jsonResponse(['success' => true]);
        if (isset($d['name']) && !trim($d['name'])) jsonResponse(['error' => 'กรุณาระบุชื่อการ์ด'], 400);

        $params[] = $id; $types .= 'i';
        $stmt = $db->prepare('UPDATE cards SET '.implode(',', $fields).' WHERE id=?');
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        jsonResponse(['success' => true]);
    }

    if ($method === 'DELETE' && $id) {
        $stmt = $db->prepare("DELETE FROM cards WHERE id=?");
        $stmt->bind_param('i', $id);
        $stmt->execute();
        jsonResponse(['success' => true]);
    }
}

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────
function handleTransactions($method, $id) {
    $db = getDB();

    if ($method === 'GET') {
        $limit = (int)($_GET['limit'] ?? 50);
        $type  = $_GET['type'] ?? '';
        if ($type) {
            $stmt = $db->prepare("SELECT * FROM transactions WHERE type=? ORDER BY created_at DESC LIMIT ?");
            $stmt->bind_param('si', $type, $limit);
        } else {
            $stmt = $db->prepare("SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?");
            $stmt->bind_param('i', $limit);
        }
        $stmt->execute();
        jsonResponse($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    }

    if ($method === 'POST') {
        $d      = getInput();
        $cardId = (int)($d['card_id'] ?? 0);
        $price  = (float)($d['price'] ?? 0);
        $qty    = (int)($d['qty']   ?? 1);

        if (!$cardId || !$price || $qty < 1) jsonResponse(['error' => 'ข้อมูลไม่ครบ'], 400);

        $stmt = $db->prepare("SELECT * FROM cards WHERE id=? AND qty>=? LIMIT 1");
        $stmt->bind_param('ii', $cardId, $qty);
        $stmt->execute();
        $c = $stmt->get_result()->fetch_assoc();
        if (!$c) jsonResponse(['error' => 'ไม่พบการ์ดหรือสต็อกไม่พอ'], 400);

        $profit = ($price - $c['cost']) * $qty;

        $stmt = $db->prepare("UPDATE cards SET qty=qty-? WHERE id=?");
        $stmt->bind_param('ii', $qty, $cardId);
        $stmt->execute();

        $stmt = $db->prepare("INSERT INTO transactions (card_id,card_name,type,price,qty,cost_each,profit) VALUES (?,?,'sell',?,?,?,?)");
        $stmt->bind_param('isdidd', $cardId, $c['name'], $price, $qty, $c['cost'], $profit);
        $stmt->execute();

        jsonResponse(['success' => true, 'profit' => $profit]);
    }
}

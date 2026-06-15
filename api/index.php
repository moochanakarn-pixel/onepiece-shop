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

$_BODY    = json_decode(file_get_contents('php://input'), true) ?: [];
$method   = $_GET['_method'] ?? $_BODY['_method'] ?? $_SERVER['REQUEST_METHOD'];
$path     = trim($_GET['path'] ?? '', '/');
$parts    = explode('/', $path);
$resource = $parts[0] ?? '';
$id       = isset($parts[1]) && is_numeric($parts[1]) ? (int)$parts[1] : null;
$sub      = (isset($parts[1]) && !is_numeric($parts[1])) ? $parts[1] : '';

// Auto-migrate: add deleted column to cards and transactions (MySQL 5.1 compatible)
$db = getDB();
$chk = $db->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cards' AND COLUMN_NAME='deleted'");
if ($chk && $chk->fetch_row()[0] == 0) {
    $db->query("ALTER TABLE cards ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0");
}
$chk2 = $db->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='transactions' AND COLUMN_NAME='deleted'");
if ($chk2 && $chk2->fetch_row()[0] == 0) {
    $db->query("ALTER TABLE transactions ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0");
}

// Auto-migrate: add image_url to cards
$chk3 = $db->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cards' AND COLUMN_NAME='image_url'");
if ($chk3 && $chk3->fetch_row()[0] == 0) {
    $db->query("ALTER TABLE cards ADD COLUMN image_url VARCHAR(500) NOT NULL DEFAULT ''");
}
// Auto-migrate: add customer_name to transactions
$chk4 = $db->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='transactions' AND COLUMN_NAME='customer_name'");
if ($chk4 && $chk4->fetch_row()[0] == 0) {
    $db->query("ALTER TABLE transactions ADD COLUMN customer_name VARCHAR(100) NOT NULL DEFAULT ''");
}
// Auto-migrate: add order_id to transactions
$chk5 = $db->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='transactions' AND COLUMN_NAME='order_id'");
if ($chk5 && $chk5->fetch_row()[0] == 0) {
    $db->query("ALTER TABLE transactions ADD COLUMN order_id VARCHAR(32) NOT NULL DEFAULT ''");
}

switch ($resource) {
    case 'stats':
        if ($sub === 'chart')       handleStatsChart();
        elseif ($sub === 'ranking') handleStatsRanking();
        else                        handleStats();
        break;
    case 'cards':        handleCards($method, $id);       break;
    case 'transactions': handleTransactions($method, $id); break;
    case 'upload':       handleUpload();                   break;
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
        'total_cost'    => (float)fetchVal($db, "SELECT COALESCE(SUM(t.price*t.qty),0) FROM transactions t INNER JOIN cards c ON t.card_id=c.id WHERE t.type='buy' AND t.deleted=0 AND c.deleted=0"),
        'total_revenue' => (float)fetchVal($db, "SELECT COALESCE(SUM(price*qty),0) FROM transactions WHERE type='sell' AND deleted=0"),
        'total_profit'  => (float)fetchVal($db, "SELECT COALESCE(SUM(profit),0)    FROM transactions WHERE type='sell' AND deleted=0"),
        'total_bought'  => (int)  fetchVal($db, "SELECT COALESCE(SUM(t.qty),0)     FROM transactions t INNER JOIN cards c ON t.card_id=c.id WHERE t.type='buy' AND t.deleted=0 AND c.deleted=0"),
        'stock_value'   => (float)fetchVal($db, "SELECT COALESCE(SUM(cost*qty),0)  FROM cards WHERE deleted=0 AND qty>0"),
        'market_value'  => (float)fetchVal($db, "SELECT COALESCE(SUM(CASE WHEN market_price>0 THEN market_price*qty ELSE cost*qty END),0) FROM cards WHERE deleted=0 AND qty>0"),
        'stock_count'   => (int)  fetchVal($db, "SELECT COALESCE(SUM(qty),0)       FROM cards WHERE deleted=0 AND qty>0"),
        'unrealized'    => (float)fetchVal($db, "SELECT COALESCE(SUM(CASE WHEN market_price>0 THEN market_price*qty ELSE cost*qty END),0) FROM cards WHERE deleted=0 AND qty>0")
                         - (float)fetchVal($db, "SELECT COALESCE(SUM(cost*qty),0)  FROM cards WHERE deleted=0 AND qty>0"),
    ]);
}

function handleStatsChart() {
    $db = getDB();
    $period = $_GET['period'] ?? 'daily';
    if ($period === 'monthly') {
        $fmt   = '%Y-%m';
        $where = "created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)";
    } else {
        $fmt   = '%Y-%m-%d';
        $where = "created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
    }
    $sql = "SELECT DATE_FORMAT(created_at,'$fmt') as label,
        COALESCE(SUM(CASE WHEN type='buy'  AND deleted=0 THEN price*qty ELSE 0 END),0) as cost,
        COALESCE(SUM(CASE WHEN type='sell' AND deleted=0 THEN price*qty ELSE 0 END),0) as revenue,
        COALESCE(SUM(CASE WHEN type='sell' AND deleted=0 THEN profit   ELSE 0 END),0) as profit
        FROM transactions WHERE $where GROUP BY label ORDER BY label ASC";
    jsonResponse(fetchAll($db, $sql));
}

function handleStatsRanking() {
    $db = getDB();
    $sql = "SELECT card_name,
        COALESCE(SUM(profit),0) as total_profit,
        COALESCE(SUM(qty),0) as total_qty
        FROM transactions WHERE type='sell' AND deleted=0
        GROUP BY card_name ORDER BY total_profit DESC LIMIT 10";
    jsonResponse(fetchAll($db, $sql));
}

function handleUpload() {
    if (empty($_FILES['image'])) jsonResponse(['error' => 'ไม่พบไฟล์'], 400);
    $file = $_FILES['image'];
    if ($file['error'] !== UPLOAD_ERR_OK) jsonResponse(['error' => 'อัปโหลดล้มเหลว'], 400);
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg','jpeg','png','gif','webp'])) jsonResponse(['error' => 'รองรับเฉพาะ jpg/png/gif/webp'], 400);
    if ($file['size'] > 5 * 1024 * 1024) jsonResponse(['error' => 'ไฟล์ต้องไม่เกิน 5MB'], 400);
    $dir = __DIR__ . '/../assets/uploads/';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $filename = uniqid('card_', true) . '.' . $ext;
    if (!move_uploaded_file($file['tmp_name'], $dir . $filename)) jsonResponse(['error' => 'บันทึกไฟล์ล้มเหลว'], 500);
    jsonResponse(['url' => 'assets/uploads/' . $filename]);
}

// ─── CARDS ────────────────────────────────────────────────────────────────────
function handleCards($method, $id) {
    $db = getDB();

    if ($method === 'GET') {
        $search = $db->real_escape_string($_GET['q'] ?? '');
        if ($search) {
            $sql = "SELECT * FROM cards WHERE deleted=0 AND qty>0 AND (name LIKE '%$search%' OR card_no LIKE '%$search%') ORDER BY (CASE WHEN market_price>0 THEN market_price ELSE cost END) DESC";
        } else {
            $sql = "SELECT * FROM cards WHERE deleted=0 AND qty>0 ORDER BY (CASE WHEN market_price>0 THEN market_price ELSE cost END) DESC";
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
        $image  = $db->real_escape_string(trim($d['image_url'] ?? ''));

        if (!$name)   jsonResponse(['error' => 'กรุณาระบุชื่อสินค้า'], 400);
        if ($qty < 1) jsonResponse(['error' => 'จำนวนต้องมากกว่า 0'],  400);

        $eName   = $db->real_escape_string($name);
        $eNo     = $db->real_escape_string($cardNo);
        $eSet    = $db->real_escape_string($set);
        $eRarity = $db->real_escape_string($rarity);

        $existing = fetchOne($db, "SELECT id,qty,cost FROM cards WHERE deleted=0 AND name='$eName' AND card_no='$eNo' AND card_set='$eSet' LIMIT 1");

        if ($existing) {
            $newQty  = $existing['qty'] + $qty;
            $newCost = round((($existing['cost'] * $existing['qty']) + ($cost * $qty)) / $newQty, 2);
            $mktSql  = $market > 0 ? "$market" : "market_price";
            $imgSql  = $image ? ",image_url='$image'" : '';
            $db->query("UPDATE cards SET qty=$newQty,cost=$newCost,market_price=$mktSql$imgSql WHERE id={$existing['id']}");
            $cardId  = $existing['id'];
        } else {
            $db->query("INSERT INTO cards (name,card_no,card_set,rarity,cost,qty,market_price,image_url) VALUES ('$eName','$eNo','$eSet','$eRarity',$cost,$qty,$market,'$image')");
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
        if (array_key_exists('image_url',    $d)) $parts[] = "image_url='"    . $db->real_escape_string(trim($d['image_url'])) . "'";

        if (empty($parts)) jsonResponse(['success' => true]);
        if (isset($d['name']) && !trim($d['name'])) jsonResponse(['error' => 'กรุณาระบุชื่อสินค้า'], 400);

        $db->query("UPDATE cards SET " . implode(',', $parts) . " WHERE id=$id");
        if ($db->error) jsonResponse(['error' => $db->error], 500);
        jsonResponse(['success' => true]);
    }

    if ($method === 'DELETE' && $id) {
        $db->query("UPDATE cards SET deleted=1 WHERE id=$id");
        jsonResponse(['success' => true]);
    }
}

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────
function handleTransactions($method, $id) {
    $db = getDB();

    if ($method === 'GET') {
        $limit = (int)($_GET['limit'] ?? 50);
        $type  = $db->real_escape_string($_GET['type'] ?? '');
        $where = $type ? "WHERE deleted=0 AND type='$type'" : 'WHERE deleted=0';
        jsonResponse(fetchAll($db, "SELECT * FROM transactions $where ORDER BY created_at DESC LIMIT $limit"));
    }

    if ($method === 'DELETE' && $id) {
        $t = fetchOne($db, "SELECT * FROM transactions WHERE id=$id AND deleted=0 LIMIT 1");
        if (!$t) jsonResponse(['error' => 'ไม่พบรายการ'], 404);

        $db->query("UPDATE transactions SET deleted=1 WHERE id=$id");

        // คืน/ลดสต็อกตามประเภทรายการ
        if ($t['type'] === 'sell') {
            $db->query("UPDATE cards SET qty=qty+{$t['qty']}, deleted=0 WHERE id={$t['card_id']}");
        } elseif ($t['type'] === 'buy') {
            $db->query("UPDATE cards SET qty=GREATEST(0, qty-{$t['qty']}) WHERE id={$t['card_id']}");
        }

        jsonResponse(['success' => true]);
    }

    if ($method === 'POST') {
        $d        = getInput();
        $cardId   = (int)($d['card_id'] ?? 0);
        $price    = (float)($d['price'] ?? 0);
        $qty      = (int)($d['qty']     ?? 1);
        $note     = $db->real_escape_string(trim($d['note'] ?? ''));
        $customer = $db->real_escape_string(trim($d['customer_name'] ?? ''));
        $orderId  = $db->real_escape_string(trim($d['order_id'] ?? ''));

        if (!$cardId || !$price || $qty < 1) jsonResponse(['error' => 'ข้อมูลไม่ครบ'], 400);

        $c = fetchOne($db, "SELECT * FROM cards WHERE deleted=0 AND id=$cardId AND qty>=$qty LIMIT 1");
        if (!$c) jsonResponse(['error' => 'ไม่พบสินค้าหรือสต็อกไม่พอ'], 400);

        $profit   = round(($price - $c['cost']) * $qty, 2);
        $cardName = $db->real_escape_string($c['name']);

        $db->query("UPDATE cards SET qty=qty-$qty WHERE id=$cardId");
        $db->query("INSERT INTO transactions (card_id,card_name,type,price,qty,cost_each,profit,note,customer_name,order_id) VALUES ($cardId,'$cardName','sell',$price,$qty,{$c['cost']},$profit,'$note','$customer','$orderId')");
        jsonResponse(['success' => true, 'profit' => $profit]);
    }
}

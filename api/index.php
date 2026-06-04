<?php
// api/index.php — REST API handler
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

$method = $_SERVER['REQUEST_METHOD'];
$path   = trim($_GET['path'] ?? '', '/');
$parts  = explode('/', $path);
$resource = $parts[0] ?? '';
$id       = isset($parts[1]) ? (int)$parts[1] : null;

switch ($resource) {
    case 'stats':       handleStats();      break;
    case 'cards':       handleCards($method, $id); break;
    case 'transactions': handleTransactions($method, $id); break;
    default:            jsonResponse(['error' => 'Not found'], 404);
}

// ─── STATS ────────────────────────────────────────────────────────────────────
function handleStats() {
    $db = getDB();

    $totalCost = $db->query("
        SELECT COALESCE(SUM(price * qty), 0) FROM transactions WHERE type='buy'
    ")->fetchColumn();

    $totalRevenue = $db->query("
        SELECT COALESCE(SUM(price * qty), 0) FROM transactions WHERE type='sell'
    ")->fetchColumn();

    $totalProfit = $db->query("
        SELECT COALESCE(SUM(profit), 0) FROM transactions WHERE type='sell'
    ")->fetchColumn();

    $totalBought = $db->query("
        SELECT COALESCE(SUM(qty), 0) FROM transactions WHERE type='buy'
    ")->fetchColumn();

    $totalSold = $db->query("
        SELECT COALESCE(SUM(qty), 0) FROM transactions WHERE type='sell'
    ")->fetchColumn();

    $stockValue = $db->query("
        SELECT COALESCE(SUM(cost * qty), 0) FROM cards WHERE qty > 0
    ")->fetchColumn();

    $marketValue = $db->query("
        SELECT COALESCE(SUM(
            CASE WHEN market_price > 0 THEN market_price * qty ELSE cost * qty END
        ), 0) FROM cards WHERE qty > 0
    ")->fetchColumn();

    $stockCount = $db->query("
        SELECT COALESCE(SUM(qty), 0) FROM cards WHERE qty > 0
    ")->fetchColumn();

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
            $stmt = $db->prepare("
                SELECT * FROM cards WHERE qty > 0 AND (name LIKE ? OR card_no LIKE ?)
                ORDER BY (CASE WHEN market_price > 0 THEN market_price ELSE cost END) DESC
            ");
            $stmt->execute(["%$search%", "%$search%"]);
        } else {
            $stmt = $db->query("
                SELECT * FROM cards WHERE qty > 0
                ORDER BY (CASE WHEN market_price > 0 THEN market_price ELSE cost END) DESC
            ");
        }
        jsonResponse($stmt->fetchAll());
    }

    if ($method === 'POST') {
        $d = getInput();
        $name   = trim($d['name'] ?? '');
        $cardNo = trim($d['card_no'] ?? '');
        $set    = trim($d['card_set'] ?? '');
        $rarity = $d['rarity'] ?? '';
        $cost   = (float)($d['cost'] ?? 0);
        $qty    = (int)($d['qty'] ?? 1);
        $market = (float)($d['market_price'] ?? 0);

        if (!$name) jsonResponse(['error' => 'กรุณาระบุชื่อการ์ด'], 400);
        if ($qty < 1) jsonResponse(['error' => 'จำนวนต้องมากกว่า 0'], 400);

        // ตรวจสอบว่ามีการ์ดนี้อยู่แล้วหรือไม่
        $stmt = $db->prepare("SELECT id, qty, cost FROM cards WHERE name=? AND card_no=? AND card_set=? LIMIT 1");
        $stmt->execute([$name, $cardNo, $set]);
        $existing = $stmt->fetch();

        if ($existing) {
            // คำนวณต้นทุนเฉลี่ยใหม่
            $newQty  = $existing['qty'] + $qty;
            $newCost = (($existing['cost'] * $existing['qty']) + ($cost * $qty)) / $newQty;
            $upd = $db->prepare("UPDATE cards SET qty=?, cost=?, market_price=IF(?>0,?,market_price) WHERE id=?");
            $upd->execute([$newQty, $newCost, $market, $market, $existing['id']]);
            $cardId = $existing['id'];
        } else {
            $ins = $db->prepare("INSERT INTO cards (name,card_no,card_set,rarity,cost,qty,market_price) VALUES (?,?,?,?,?,?,?)");
            $ins->execute([$name, $cardNo, $set, $rarity, $cost, $qty, $market]);
            $cardId = $db->lastInsertId();
        }

        // บันทึก transaction
        $t = $db->prepare("INSERT INTO transactions (card_id,card_name,type,price,qty) VALUES (?,?,'buy',?,?)");
        $t->execute([$cardId, $name, $cost, $qty]);

        jsonResponse(['success' => true, 'card_id' => $cardId]);
    }

    if ($method === 'PUT' && $id) {
        $d = getInput();
        $market = (float)($d['market_price'] ?? 0);
        $stmt = $db->prepare("UPDATE cards SET market_price=? WHERE id=?");
        $stmt->execute([$market, $id]);
        jsonResponse(['success' => true]);
    }

    if ($method === 'DELETE' && $id) {
        $stmt = $db->prepare("DELETE FROM cards WHERE id=?");
        $stmt->execute([$id]);
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
            $stmt->execute([$type, $limit]);
        } else {
            $stmt = $db->prepare("SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?");
            $stmt->execute([$limit]);
        }
        jsonResponse($stmt->fetchAll());
    }

    if ($method === 'POST') {
        $d      = getInput();
        $cardId = (int)($d['card_id'] ?? 0);
        $price  = (float)($d['price'] ?? 0);
        $qty    = (int)($d['qty'] ?? 1);

        if (!$cardId || !$price || $qty < 1) jsonResponse(['error' => 'ข้อมูลไม่ครบ'], 400);

        $card = $db->prepare("SELECT * FROM cards WHERE id=? AND qty>=? LIMIT 1");
        $card->execute([$cardId, $qty]);
        $c = $card->fetch();
        if (!$c) jsonResponse(['error' => 'ไม่พบการ์ดหรือสต็อกไม่พอ'], 400);

        $profit = ($price - $c['cost']) * $qty;

        $upd = $db->prepare("UPDATE cards SET qty=qty-? WHERE id=?");
        $upd->execute([$qty, $cardId]);

        $t = $db->prepare("INSERT INTO transactions (card_id,card_name,type,price,qty,cost_each,profit) VALUES (?,?,'sell',?,?,?,?)");
        $t->execute([$cardId, $c['name'], $price, $qty, $c['cost'], $profit]);

        jsonResponse(['success' => true, 'profit' => $profit]);
    }
}

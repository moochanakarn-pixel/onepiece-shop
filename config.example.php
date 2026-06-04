<?php
// คัดลอกไฟล์นี้แล้วเปลี่ยนชื่อเป็น config.php
// จากนั้นแก้ค่าด้านล่างให้ตรงกับ server ของคุณ

define('DB_HOST', 'localhost');
define('DB_NAME', 'onepiece_shop');   // ชื่อ database
define('DB_USER', 'root');            // username MySQL
define('DB_PASS', 'your_password');   // password MySQL
define('DB_CHARSET', 'utf8');

define('APP_SECRET', 'change_this_random_string_32chars');

date_default_timezone_set('Asia/Bangkok');

function getDB() {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            http_response_code(500);
            die(json_encode(['error' => 'Database connection failed']));
        }
    }
    return $pdo;
}

function jsonResponse($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function getInput() {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

# One Piece Card Shop — คู่มือติดตั้ง

## โครงสร้างไฟล์
```
onepiece-shop/
├── index.html          ← หน้าเว็บหลัก
├── config.php          ← ตั้งค่า DB (แก้ก่อนใช้!)
├── .htaccess           ← Apache routing
├── api/
│   └── index.php       ← REST API
└── setup/
    └── schema.sql      ← SQL สร้างตาราง
```

## ขั้นตอนติดตั้ง

### 1. สร้าง Database
```sql
CREATE DATABASE onepiece_shop CHARACTER SET utf8 COLLATE utf8_general_ci;
```

### 2. สร้างตาราง
```bash
mysql -u root -p onepiece_shop < setup/schema.sql
```

### 3. แก้ config.php
```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'onepiece_shop');
define('DB_USER', 'your_db_user');
define('DB_PASS', 'your_db_password');
define('APP_SECRET', 'random_32_char_string_here');
```

### 4. อัปโหลดไฟล์
อัปโหลดทั้งโฟลเดอร์ไปยัง web root เช่น `/var/www/html/shop/`
หรือตั้ง document root ชี้มาที่โฟลเดอร์นี้เลย

### 5. ตั้ง Permission
```bash
chmod 644 config.php
chmod 644 .htaccess
chmod 755 api/
```

### 6. เปิดใช้ mod_rewrite (Apache)
```bash
a2enmod rewrite
systemctl restart apache2
```
ตรวจสอบ Apache config มี `AllowOverride All` สำหรับ directory นั้น

---

## Cloudflare Settings แนะนำ
- **SSL/TLS**: Full (strict)
- **Always Use HTTPS**: On
- **Minimum TLS Version**: TLS 1.2
- **Cache**: Standard (ไฟล์ .html/.php จะ bypass อยู่แล้ว)

---

## Requirements
- PHP 7.4+ / 8.x (รองรับ PHP 8.5.1)
- MySQL 5.1+ / MariaDB
- Apache + mod_rewrite
- PDO extension (mysql)

## หมายเหตุ
- ราคาในระบบเป็นหน่วยบาท (฿)
- เลขการ์ดต้องตรงกับ card2price.com เช่น OP01-001, ST30-001

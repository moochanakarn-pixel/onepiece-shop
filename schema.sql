-- One Piece Card Shop Database
-- MySQL 5.1 compatible / UTF-8

SET NAMES utf8;
SET CHARACTER SET utf8;

CREATE TABLE IF NOT EXISTS cards (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(200) NOT NULL COMMENT 'ชื่อการ์ด',
  card_no      VARCHAR(50)  NOT NULL DEFAULT '' COMMENT 'เลขการ์ด เช่น OP01-001',
  card_set     VARCHAR(50)  NOT NULL DEFAULT '' COMMENT 'เซต เช่น OP-01',
  rarity       ENUM('C','UC','R','SR','SEC','L','') NOT NULL DEFAULT '',
  cost         DECIMAL(10,2) NOT NULL DEFAULT '0.00' COMMENT 'ต้นทุนเฉลี่ยต่อใบ',
  qty          INT NOT NULL DEFAULT '0' COMMENT 'จำนวนคงเหลือ',
  market_price DECIMAL(10,2) NOT NULL DEFAULT '0.00' COMMENT 'ราคาตลาด card2price',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS transactions (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  card_id    INT UNSIGNED NOT NULL DEFAULT '0',
  card_name  VARCHAR(200) NOT NULL DEFAULT '',
  type       ENUM('buy','sell') NOT NULL,
  price      DECIMAL(10,2) NOT NULL DEFAULT '0.00' COMMENT 'ราคาต่อใบ',
  qty        INT NOT NULL DEFAULT '1',
  cost_each  DECIMAL(10,2) NOT NULL DEFAULT '0.00' COMMENT 'ต้นทุนต่อใบ ณ เวลาขาย',
  profit     DECIMAL(10,2) NOT NULL DEFAULT '0.00' COMMENT 'กำไร/ขาดทุน รวม',
  note       VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  confirmation_code VARCHAR(32) NOT NULL UNIQUE,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  request_hash CHAR(64) NOT NULL,
  response_json LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_bookings_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS booking_items (
  booking_id BIGINT UNSIGNED NOT NULL,
  product_code VARCHAR(64) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  PRIMARY KEY (booking_id, product_code),
  INDEX idx_booking_items_product (product_code),
  CONSTRAINT fk_booking_items_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS booking_mutex (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO booking_mutex (id) VALUES (1);

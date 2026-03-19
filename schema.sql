USE herbalife_stock;

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  type ENUM('ADD','SELL') NOT NULL,
  quantity INT NOT NULL,
  sale_type ENUM('CENTER','RETAIL') DEFAULT NULL,
  note VARCHAR(255) DEFAULT NULL,
  date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

INSERT IGNORE INTO categories (name) VALUES
('Formula 1 500g'),('Formula 1 750g'),('Personalized Protein'),
('ShakeMate'),('Afresh'),('Dino Shake'),('Digestive Health'),
('Bone & Joint Health'),('Sport Nutrition'),('Enhancers'),
('Heart Health'),('Skin Care'),('Vriti Life'),
('Eye Health'),("Men's Health"),("Women's Health"),('Sleep Support');

INSERT IGNORE INTO products (category_id, name) VALUES
((SELECT id FROM categories WHERE name='Formula 1 500g'),'Vanilla'),
((SELECT id FROM categories WHERE name='Formula 1 500g'),'Kulfi'),
((SELECT id FROM categories WHERE name='Formula 1 500g'),'Chocolate'),
((SELECT id FROM categories WHERE name='Formula 1 500g'),'Banana'),
((SELECT id FROM categories WHERE name='Formula 1 500g'),'Mango'),
((SELECT id FROM categories WHERE name='Formula 1 500g'),'Orange'),
((SELECT id FROM categories WHERE name='Formula 1 500g'),'Rose Kheer'),
((SELECT id FROM categories WHERE name='Formula 1 500g'),'Strawberry'),
((SELECT id FROM categories WHERE name='Formula 1 500g'),'Paan'),
((SELECT id FROM categories WHERE name='Formula 1 750g'),'Vanilla'),
((SELECT id FROM categories WHERE name='Formula 1 750g'),'Kulfi'),
((SELECT id FROM categories WHERE name='Formula 1 750g'),'Mango'),
((SELECT id FROM categories WHERE name='Formula 1 750g'),'Rose Kheer'),
((SELECT id FROM categories WHERE name='Personalized Protein'),'400g'),
((SELECT id FROM categories WHERE name='Personalized Protein'),'200g'),
((SELECT id FROM categories WHERE name='ShakeMate'),'500g'),
((SELECT id FROM categories WHERE name='Afresh'),'Lemon'),
((SELECT id FROM categories WHERE name='Afresh'),'Ginger'),
((SELECT id FROM categories WHERE name='Afresh'),'Kashmir Kawa'),
((SELECT id FROM categories WHERE name='Afresh'),'Peach'),
((SELECT id FROM categories WHERE name='Afresh'),'Cinnamon'),
((SELECT id FROM categories WHERE name='Afresh'),'Tulasi'),
((SELECT id FROM categories WHERE name='Afresh'),'Elaichi'),
((SELECT id FROM categories WHERE name='Dino Shake'),'Chocolate'),
((SELECT id FROM categories WHERE name='Dino Shake'),'Strawberry'),
((SELECT id FROM categories WHERE name='Digestive Health'),'Aloe Plus'),
((SELECT id FROM categories WHERE name='Digestive Health'),'Active Fiber Complex'),
((SELECT id FROM categories WHERE name='Digestive Health'),'Aloe Concentrate'),
((SELECT id FROM categories WHERE name='Digestive Health'),'Activated Fiber'),
((SELECT id FROM categories WHERE name='Digestive Health'),'Simply Probiotic'),
((SELECT id FROM categories WHERE name='Bone & Joint Health'),'Joint Support'),
((SELECT id FROM categories WHERE name='Bone & Joint Health'),'Calcium'),
((SELECT id FROM categories WHERE name='Sport Nutrition'),'H24 Hydrate'),
((SELECT id FROM categories WHERE name='Sport Nutrition'),'H24 Rebuild Strength'),
((SELECT id FROM categories WHERE name='Sport Nutrition'),'Lift Off'),
((SELECT id FROM categories WHERE name='Enhancers'),'Multi Vitamin'),
((SELECT id FROM categories WHERE name='Enhancers'),'Cell Activator'),
((SELECT id FROM categories WHERE name='Enhancers'),'Cell-U-Loss'),
((SELECT id FROM categories WHERE name='Enhancers'),'Herbal Control'),
((SELECT id FROM categories WHERE name='Heart Health'),'Nite Works'),
((SELECT id FROM categories WHERE name='Heart Health'),'Beta Heart'),
((SELECT id FROM categories WHERE name='Heart Health'),'Herba Life Line Omega 3'),
((SELECT id FROM categories WHERE name='Skin Care'),'Skin Booster Sachets'),
((SELECT id FROM categories WHERE name='Skin Care'),'Skin Booster Canister'),
((SELECT id FROM categories WHERE name='Skin Care'),'Facial Cleanser'),
((SELECT id FROM categories WHERE name='Skin Care'),'Facial Toner'),
((SELECT id FROM categories WHERE name='Skin Care'),'Facial Serum'),
((SELECT id FROM categories WHERE name='Skin Care'),'Moisturizer'),
((SELECT id FROM categories WHERE name='Vriti Life'),'Brain Health'),
((SELECT id FROM categories WHERE name='Vriti Life'),'Triphala'),
((SELECT id FROM categories WHERE name='Vriti Life'),'Immune Health'),
((SELECT id FROM categories WHERE name='Eye Health'),'Ocular Defense'),
((SELECT id FROM categories WHERE name="Men's Health"),'Male Factor'),
((SELECT id FROM categories WHERE name="Women's Health"),"Woman's Choice"),
((SELECT id FROM categories WHERE name='Sleep Support'),'Sleep Enhance');

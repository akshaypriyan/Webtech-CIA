-- =====================================================================
-- Online Marketplace Web Application - Initial Seed Data (Categories)
-- =====================================================================

USE `marketplace_db`;

-- Insert initial product categories
INSERT INTO `categories` (`category_name`, `description`, `status`) VALUES
('Electronics', 'Smartphones, laptops, audio equipment, gaming, and cutting-edge tech gadgets.', 'Active'),
('Fashion', 'Apparel, footwear, accessories, and seasonal collections for men and women.', 'Active'),
('Home & Kitchen', 'Furniture, cookware, modern appliances, smart lighting, and home decor.', 'Active'),
('Books', 'Bestsellers, academic textbooks, fiction, non-fiction, and personal development.', 'Active'),
('Beauty', 'Skincare, grooming, fragrances, makeup, and organic personal care products.', 'Active'),
('Sports', 'Athletic gear, fitness equipment, sportswear, outdoor camping, and hydration.', 'Active')
ON DUPLICATE KEY UPDATE 
  `description` = VALUES(`description`),
  `status` = VALUES(`status`);

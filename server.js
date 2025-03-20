const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(cors({ origin: "http://localhost:3001" }));
app.use(bodyParser.json());

// MySQL Connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root', // Change as needed
  password: '', // Change as needed
  database: 'invoicer_db'
});

db.connect(err => {
  if (err) {
    console.error('❌ Database connection failed:', err);
  } else {
    console.log('✅ Connected to Invoicer database');
  }
});

// Create Invoice with Relations
app.post('/invoices', (req, res) => {
    console.log("📨 Incoming request:", req.body);
    const { client, vendor, invoice, items, payment } = req.body;

    db.beginTransaction(err => {
        if (err) {
            console.error("❌ Error starting transaction:", err);
            return res.status(500).json({ error: err.message });
        }
        console.log("🚀 Transaction started");

        // Insert or get Client
        db.query('SELECT client_id FROM client WHERE client_name = ? AND client_address = ?', 
        [client.name, client.address], (err, clientResults) => {
            if (err) {
                console.error("❌ Error fetching client:", err);
                return db.rollback(() => res.status(500).json({ error: err.message }));
            }
            console.log("✅ Client check complete");

            let clientId = clientResults.length ? clientResults[0].client_id : null;
            if (!clientId) {
                console.log("🆕 Inserting new client:", client);
                db.query('INSERT INTO client (client_name, client_address) VALUES (?, ?)', 
                [client.name, client.address], (err, result) => {
                    if (err) {
                        console.error("❌ Error inserting client:", err);
                        return db.rollback(() => res.status(500).json({ error: err.message }));
                    }
                    clientId = result.insertId;
                    console.log(`✅ New client inserted with ID: ${clientId}`);
                    insertVendor();
                });
            } else {
                console.log(`🔄 Existing client found with ID: ${clientId}`);
                insertVendor();
            }

            function insertVendor() {
                console.log("🔍 Checking vendor:", vendor);
                db.query('SELECT vendor_id FROM vendor WHERE vendor_name = ? AND vendor_address = ?', 
                [vendor.name, vendor.address], (err, vendorResults) => {
                    if (err) {
                        console.error("❌ Error fetching vendor:", err);
                        return db.rollback(() => res.status(500).json({ error: err.message }));
                    }
                    console.log("✅ Vendor check complete");

                    let vendorId = vendorResults.length ? vendorResults[0].vendor_id : null;
                    if (!vendorId) {
                        console.log("🆕 Inserting new vendor:", vendor);
                        db.query('INSERT INTO vendor (vendor_name, vendor_address, vendor_email, vendor_phone, vendor_website, vendor_payment_infor_id) VALUES (?, ?, ?, ?, ?, ?)', 
                            [vendor.name, vendor.address, vendor.email, vendor.phone, vendor.website, "1"], (err, result) => {
                            if (err) {
                                console.error("❌ Error inserting vendor:", err);
                                return db.rollback(() => res.status(500).json({ error: err.message }));
                            }
                            vendorId = result.insertId;
                            console.log(`✅ New vendor inserted with ID: ${vendorId}`);
                            insertInvoice(clientId, vendorId);
                        });
                    } else {
                        console.log(`🔄 Existing vendor found with ID: ${vendorId}`);
                        insertInvoice(clientId, vendorId);
                    }
                });
            }

            function insertInvoice(clientId, vendorId) {
                console.log("📝 Inserting invoice:", invoice);
                const paid_ = "23244";
                const balance = "123123";
                db.query('INSERT INTO invoice (client_id, vendor_id, invoice_number, invoice_date, due_date, additional_note, paid_, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [clientId, vendorId, invoice.number, invoice.date, invoice.due_date, invoice.notes, paid_, balance], (err, result) => {
                    if (err) {
                        console.error("❌ Error inserting invoice:", err);
                        return db.rollback(() => res.status(500).json({ error: err.message }));
                    }

                    const invoiceId = result.insertId;
                    console.log(`✅ Invoice inserted with ID: ${invoiceId}`);
                    insertItems(invoiceId);
                });
            }

            function insertItems(invoiceId) {
                if (!items || items.length === 0) {
                    console.log("⚠️ No items found, skipping items insertion");
                    return insertPayment(invoiceId);
                }

                let completed = 0;
                console.log("🛒 Inserting invoice items:", items);
                items.forEach(({ description, quantity, price, amount }) => {

                    db.query('INSERT INTO invoice_item (invoice_id, item_description, item_quantity, item_unit_price, item_cost) VALUES (?, ?, ?, ?, ?)',
                        [invoiceId, description, quantity, price, amount], (err) => {
                        if (err) {
                            console.error("❌ Error inserting invoice item:", err);
                            return db.rollback(() => res.status(500).json({ error: err.message }));
                        }
                        completed++;
                        if (completed === items.length) insertPayment(invoiceId);
                    });
                });
            }

            function insertPayment(invoiceId) {
                console.log("💰 Inserting payment info:", payment);
                db.query('INSERT INTO payment_info (payment_type, payment_name_infor, payment_account_number) VALUES (?, ?, ?)',
                    [payment.type, payment.name, payment.account_number], (err) => {
                    if (err) {
                        console.error("❌ Error inserting payment info:", err);
                        return db.rollback(() => res.status(500).json({ error: err.message }));
                    }
                    commitTransaction();
                });
            }

            function commitTransaction() {
                db.commit(err => {
                    if (err) {
                        console.error("❌ Error committing transaction:", err);
                        return db.rollback(() => res.status(500).json({ error: err.message }));
                    }
                    console.log("✅ Transaction committed successfully");
                    res.json({ message: 'Invoice created successfully' });
                });
            }
        });
    });
});

// Update Invoice Items
app.put("/invoices/:invoiceNumber", (req, res) => {
    const { invoiceNumber } = req.params;
    const { items } = req.body;

    db.query("SELECT invoice_id FROM invoice WHERE invoice_number = ?", [invoiceNumber], (err, result) => {
        if (err || result.length === 0) {
            return res.status(404).json({ message: "Invoice not found" });
        }

        const invoiceId = result[0].invoice_id;

        db.beginTransaction(err => {
            if (err) return res.status(500).json({ error: err.message });

            db.query("DELETE FROM invoice_item WHERE invoice_id = ?", [invoiceId], err => {
                if (err) return db.rollback(() => res.status(500).json({ error: err.message }));

                let completed = 0;
                items.forEach(({ description, quantity, price, amount }) => {
                    db.query("INSERT INTO invoice_item (invoice_id, item_description, item_quantity, item_unit_price, item_cost) VALUES (?, ?, ?, ?, ?)",
                        [invoiceId, description, quantity, price, amount], err => {
                            if (err) return db.rollback(() => res.status(500).json({ error: err.message }));
                            completed++;
                            if (completed === items.length) {
                                db.commit(err => {
                                    if (err) return db.rollback(() => res.status(500).json({ error: err.message }));
                                    res.json({ message: "Invoice updated successfully" });
                                });
                            }
                        }
                    );
                });
            });
        });
    });
});

// Start Server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});

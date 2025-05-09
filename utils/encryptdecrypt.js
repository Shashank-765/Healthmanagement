// utils/encryptdecrypt.js
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class EncryptionService {
    constructor() {
        this.algorithm = 'aes-256-cbc';
        this.key = Buffer.from(process.env.ENCRYPTION_KEY, 'utf-8');
        this.iv = Buffer.from(process.env.ENCRYPTION_IV, 'utf-8');
    }

    async encrypt(data) {
        try {
            const cipher = crypto.createCipheriv(this.algorithm, this.key, this.iv);
            let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
            encrypted += cipher.final('hex');

            // Store in JSON file
            await this.storeEncryptedData({
                timestamp: new Date(),
                iv: this.iv.toString('hex'),
                encryptedData: encrypted
            });

            return {
                iv: this.iv.toString('hex'),
                encryptedData: encrypted
            };
        } catch (error) {
            console.error('Encryption error:', error);
            throw new Error('Encryption failed');
        }
    }

    async decrypt(encryptedData, iv) {
        try {
            if (!encryptedData || !iv) {
                console.log('No encrypted data or IV provided');
                return null;
            }

            const decipher = crypto.createDecipheriv(
                this.algorithm,
                this.key,
                Buffer.from(iv, 'hex')
            );
            let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return JSON.parse(decrypted);
        } catch (error) {
            console.error('Decryption error:', error);
            return null; // Return null instead of throwing error
        }
    }

    async storeEncryptedData(data) {
        try {
            const filePath = path.join(__dirname, '../data/encrypted_records.json');
            let existingData = [];
            
            try {
                const fileContent = await fs.readFile(filePath, 'utf8');
                existingData = JSON.parse(fileContent);
            } catch (error) {
                // File doesn't exist yet, will create new
            }

            existingData.push(data);
            await fs.writeFile(filePath, JSON.stringify(existingData, null, 2));
        } catch (error) {
            console.error('Error storing encrypted data:', error);
        }
    }
}

module.exports = new EncryptionService();
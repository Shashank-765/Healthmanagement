// utils/ipfs.service.js
const { create } = require('ipfs-http-client');
const encryptionService = require('../utils/encryptdecrypt');

class IPFSService {
    constructor() {
        this.ipfs = create({ url: process.env.IPFS_NODE_URL });
    }

    async uploadEncryptedData(data) {
        try {
            // Encrypt data
            const encrypted = await encryptionService.encrypt(data);

            // Upload to IPFS
            const { cid } = await this.ipfs.add(JSON.stringify(encrypted));

            return {
                cid: cid.toString(),
                iv: encrypted.iv
            };
        } catch (error) {
            console.error('IPFS upload error:', error);
            throw new Error('Failed to upload to IPFS');
        }
    }

    async retrieveAndDecrypt(cid, iv) {
        try {
            // Check if CID is valid
            if (!cid || cid === 'defaultCID' || cid === '') {
                return { success: true, data: [] }; // Return empty array for new/uninitialized collections
            }

            // Get from IPFS
            const stream = this.ipfs.cat(cid);
            let chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            
            const encryptedData = Buffer.concat(chunks).toString();
            const parsed = JSON.parse(encryptedData);
            
            // Decrypt
            return await encryptionService.decrypt(parsed.encryptedData, iv);
        } catch (error) {
            console.error('IPFS retrieval error:', error);
            // Return empty array instead of throwing error for defaultCID
            if (error.message.includes('defaultCID')) {
                return { success: true, data: [] };
            }
            throw error;
        }
    }
}

module.exports = new IPFSService();
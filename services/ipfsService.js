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
            throw new Error('Failed to retrieve from IPFS');
        }
    }
}

module.exports = new IPFSService();
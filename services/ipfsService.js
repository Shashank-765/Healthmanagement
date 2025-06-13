// utils/ipfs.service.js
const { create } = require('ipfs-http-client');
const encryptionService = require('../utils/encryptdecrypt');

class IPFSService {
    constructor() {
        this.ipfs = create({ url: process.env.IPFS_NODE_URL });
    }

    async uploadEncryptedData(data) {
        try {
            const encrypted = await encryptionService.encrypt(data);
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
                console.log('Invalid CID provided:', cid);
                return {};
            }

            try {
                const stream = this.ipfs.cat(cid);
                let chunks = [];
                for await (const chunk of stream) {
                    chunks.push(chunk);
                }
                
                const encryptedData = Buffer.concat(chunks).toString();
                const parsed = JSON.parse(encryptedData);

                // Validate the parsed data structure
                if (!parsed.encryptedData) {
                    console.error('Invalid encrypted data structure:', parsed);
                    return {};
                }

                // Use the provided IV if available, otherwise use the one from the encrypted data
                const decryptionIV = iv || parsed.iv;
                if (!decryptionIV) {
                    console.error('No IV available for decryption');
                    return {};
                }

                return await encryptionService.decrypt(parsed.encryptedData, decryptionIV);
            } catch (fetchError) {
                console.error('IPFS data fetch error:', fetchError);
                return {}; // Return empty object instead of throwing error
            }
        } catch (error) {
            console.error('IPFS retrieval error:', error);
            // Return empty object instead of throwing error
            return {};
        }
    }
}

module.exports = new IPFSService();
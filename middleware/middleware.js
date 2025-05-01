const jwt = require('jsonwebtoken');
const Cookies = require('js-cookie');

const authMiddleware = {
    authenticateToken: (req, res, next) => {
        try {
            // Debug logs
            console.log('Headers received:', req.headers);
            console.log('Cookies received:', req.cookies);

            // Check for token in Authorization header
            const authHeader = req.headers.authorization;
            let token;

            if (authHeader) {
                token = authHeader.split(' ')[1];
                console.log('Token from Authorization header:', token);
            } else {
                // Check for token in cookies
                token = req.cookies?.adminToken;
                console.log('Token from cookies:', token);
            }

            if (!token) {
                return res.status(401).json({
                    statusCode: 401,
                    success: false,
                    message: "No token provided"
                });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            console.log("Decoded token:", decoded);
            if (!decoded.role) {
                console.error("Token missing role:", decoded);
                return res.status(401).json({
                    statusCode: 401,
                    success: false,
                    message: "Token missing role"
                });
            }
            req.user = decoded;
            next();
        } catch (error) {
            console.error('Detailed middleware error:', error);
            return res.status(401).json({
                statusCode: 401,
                success: false,
                message: error.message || "Invalid token"
            });
        }
    }
};

module.exports = authMiddleware;
const jwt = require('jsonwebtoken');
const Cookies = require('js-cookie');

const authMiddleware = {
    authenticateToken: (req, res, next) => {
        try {
            // Check for token in Authorization header
            const authHeader = req.headers.authorization;
            let token;

            if (authHeader) {
                token = authHeader.split(' ')[1];
            } else {
                // Check for token in cookies
                token = req.cookies?.adminToken;
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
            console.error("Token verification error:", error);
            return res.status(401).json({
                statusCode: 401,
                success: false,
                message: "Invalid token"
            });
        }
    }
};

module.exports = authMiddleware;
const jwt = require('jsonwebtoken');

const authMiddleware = {
    authenticateToken: (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({
                    statusCode: 401,
                    success: false,
                    message: "No token provided"
                });
            }

            const token = authHeader.split(' ')[1];
            if (!token) {
                return res.status(401).json({
                    statusCode: 401,
                    success: false,
                    message: "Invalid token format"
                });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
            next();
        } catch (error) {
            return res.status(401).json({
                statusCode: 401,
                success: false,
                message: "Invalid token"
            });
        }
    }
};

module.exports = authMiddleware;
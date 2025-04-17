const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).json({
            statusCode: 401,
            success: false,
            message: "unauthorized"
        });
    }
}

module.exports = authMiddleware;
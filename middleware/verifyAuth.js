import jwt from 'jsonwebtoken'

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  console.log('auth header is ----------- ', authHeader);
  
  if (!authHeader || !authHeader.startsWith("Bearer "))
    return res.status(401).json({ message: "Access denied. No token provided." });

  const token = authHeader.split(" ")[1];
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded JWT payload:', decoded); // Add this line
    req.user = decoded; 
    next();
  } catch (err) {
    console.log('JWT verification error:', err.message); // Add this line
    return res.status(403).json({ message: "Invalid or expired token." });
  }
};

export default verifyToken;
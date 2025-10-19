import jwt from 'jsonwebtoken'
import { catchAsyncError } from "./catchAsyncError.js";
import ErrorHandler from "../utils/errorHandler.js";

export const isAuthenticated = catchAsyncError(async (req, res, next) => {
  let token;
  const { authorization } = req.headers;
  console.log('====================================');
  console.log('is token ---------- ' , authorization);
  console.log('====================================');
  if (!authorization || !authorization.startsWith("Bearer"))
    return next(new ErrorHandler("please provide the token", 401));

  // Get Token from header
  token = authorization.split(" ")[1];
  
  let decoded
  if (!token) return next(new ErrorHandler("Not Logged In", 401));
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return next(new ErrorHandler("Session_Expired", 403));
  }
  if(!decoded) return next(new ErrorHandler("Session_Expired", 403));
  req.user = decoded;
  //await User.findById(decoded._id).select('uid role status token firstName lastName');

  // if (req.user.role !== "super-admin" && req.user.token != token) {
  //   return next(new ErrorHandler("Session_Expired", 403));
  // }

  // if (req.user.status === "deleted") {
  //   return next(new ErrorHandler("You have no longer active account", 401));
  // }
  console.log('reached to next -------------------', token);
  
  next();
});

import jwt, { decode } from "jsonwebtoken";
import User from "../models/user.model.js";

export const protectRoute = async (req,res,next)=>{
 try{
    const token= req.cookies.jwt; //jwt is name of cookie we made in our lib do we are  grabbing that cookie here to check the token

    if(!token){
        return res.status(401).json({
            message:"Unauthorized access -No token provided"
        })
    }

    const decoded =jwt.verify(token, process.env.JWT_SECRET)

    if(!decoded){
        return res.status(401).json({
            message:"Unauthorized - Invalid token"
        })
    }
    
    const user = await User.findById(decoded.userId).select("-password");

    if(!user){
        return res.status(404).json({message:"User not found"});
    }

    req.user = user
    next()

 }catch(error){
    console.log("error in protectRoute middleware: ",error.message);
    res.status(500).json({message:"internal server error"})
 }
}
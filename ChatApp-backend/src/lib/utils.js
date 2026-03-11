import jwt from "jsonwebtoken"

export const generateToken =(userId, res) =>{
  
    const token = jwt.sign({userId}, process.env.JWT_SECRET,{
        expiresIn:"7d"
    });
    
    res.cookie("jwt",token,{
        maxAge:7*24*60*60*1000,
        httpOnly: true, //prevents XSS attact cross-site scripting attack
        sameSite: "strict",// CSRF attack cross-site req forgery attack
        secure: process.env.NODE_ENV !== "development" //this is gonna be false as NODE_ENV == "development"
    });
    return token;
}
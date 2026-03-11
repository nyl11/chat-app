import { generateToken } from "../lib/utils.js";
import User from "../models/user.model.js";
import bcrypt from "bcrypt"
import cloudinary from "../lib/cloudinary.js"

export const signup =async (req,res)=>{
    const{fullName,email,password}=req.body
    try{
        if(!fullName || !email || !password){
             return res.status(400).json({message:"fill all the feilds"})
        }

        if(password.length<6){
            return res.status(400).json({message:"password must be at least 6 character"})
        }

        const user = await User.findOne({email})

        if(user) return res.status(400).json({message:"email already exixts"});

        const salt = await bcrypt.genSalt(10)
        const hashedPassword= await bcrypt.hash(password,salt)

        const newUser = new User({
            fullName,
            email,
            password:hashedPassword
        })
        if(newUser){
            //generate jwt token here
            generateToken(newUser._id,res)
            await newUser.save();

            res.status(201).json({
                _id:newUser._id,
                fullName:newUser.fullName,
                email:newUser.email,
                profilePic:newUser.profilePic

            });

        }else{
            res.status(400).json({message:"invalid user data"});
        }

    }catch(error){
        console.log("error in signup controller", error.message);
        res.status(500).json({message:"internal server error"})
    }
} ;

export const login = async (req,res)=>{
    const {email, password} = req.body;
    try{
        const user = await User.findOne({email});

        if(!user){
            return res.status(400).json({mesage:"invalid credentials"});
        }

        const isCorrectPassword = await bcrypt.compare(password, user.password);
        if(!isCorrectPassword){
             return res.status(400).json({mesage:"invalid credentials"});
        }

        generateToken(user._id,res)// the only purpose of res here is to generate cookie
            
        res.status(200).json({
                _id:user._id,
                fullName:user.fullName,
                email:user.email,
                profilePic:user.profilePic

            });

        }

    catch(error){
        console.log("error in login controller", error.message);
        res.status(500).json({message:"internal server error"})
    }
    
} ;

export const logout =(req,res)=>{
  try{
    res.cookie("jwt","",{maxAge:0})
    res.status(200).json({message:"logged out sucessfully"})
  }catch(error){
    console.log("error in logout controller", error.message)
  }
} ;

export const updateProfile = async (req, res)=>{
    try{
        const {profilePic}=req.body;
        const userId= req.user._id;

        if(!profilePic){
            return res.status(400).json({message:"Profile picture required"});
        }

        const uploadResponse=await cloudinary.uploader.upload(profilePic) //cloudinary is not our db but a bucket for our images

        const updatedUser= await User.findByIdAndUpdate(userId,{profilePic:uploadResponse.secure_url},{new:true})

        res.status(200).json(updatedUser)

    }catch(error){
        console.log("error in updateprofile controller:",error.message);
        res.status(500).json({message:"Internal server error"});
    }
}

export const checkAuth = (req,res)=>{
  {/* just to check the user and token */}
 try{
    res.status(200).json(req.user);
 }catch(error){
    console.log("error in check auth controller:",error.message);
    res.status(500).json({message:"internal server error"});
 }
}

export const googleSignup = async (req, res) => {
  const { token } = req.body;
  
  try {
    const { OAuth2Client } = await import('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    
    // Verify the token with Google
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const { email, name, picture } = payload;
    
    // Check if user already exists
    let user = await User.findOne({ email });
    
    if (user) {
      // User exists - link Google account and update profile pic if needed
      if (!user.profilePic && picture) {
        user.profilePic = picture;
        await user.save();
      }
      
      generateToken(user._id, res);
      
      return res.status(200).json({
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        profilePic: user.profilePic,
      });
    }
    
    // Create new user
    const newUser = new User({
      fullName: name,
      email,
      password: Math.random().toString(36).slice(-8), // Random password for OAuth users
      profilePic: picture || "",
    });
    
    await newUser.save();
    generateToken(newUser._id, res);
    
    res.status(201).json({
      _id: newUser._id,
      fullName: newUser.fullName,
      email: newUser.email,
      profilePic: newUser.profilePic,
    });
    
  } catch (error) {
    console.log("error in google signup controller:", error.message);
    res.status(400).json({ message: "Invalid Google token" });
  }
};
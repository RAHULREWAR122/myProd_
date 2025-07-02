import User from "../models/User.js";

const loggedInUserDetails = async (req, res) => {
    try {
        const { userId } = req.body; 
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required"
            });
        }

        const user = await User.findById(userId).select('-password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

       
        res.status(200).json({
            success: true,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                provider: user.provider,
                startupType: user.startupType,
                createdAt: user.createdAt,
                __v: user.__v
            }
        });

    } catch (error) {
        console.error('Error in loggedInUserDetails:', error);
         
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID format"
            });
        }
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

export default loggedInUserDetails;
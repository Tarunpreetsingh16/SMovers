//APIs related to a driver, someone who is booked by a booker

const express = require('express');
const routeAuth = require('../../middleware/auth');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const Driver= require('../../models/Driver');
const Availability = require('../../models/Availability');
const Blacklist = require('../../models/BlackList')
const bcrypt = require('bcryptjs');
const config = require('config');
const jwt = require('jsonwebtoken');
const fn = require('../../libs/functions');
const { Bookings } = require('../../models/Booking');
const BlackList = require('../../models/BlackList');

// @route  POST api/drivers
// @desc   Register router
// @access Public
router.post(
    '/',
     [ //validate the request parameters sent by the client
        check('name', 'Name is required').not().isEmpty(), //check if name is empty
        check('email', 'Enter a valid email').isEmail(), //use validator to validate an email
        check('password', 'Password length should be at least 8').isLength({
          //password should be matched according to the criteria defind in the line above
          min: 8,
        }),
        check('confirmPassword',"Both passowrds must match").custom((value,{req})=>{
          return value===req.body.password;
        }),
        check('rate','Rate (cost/km) is required').not().isEmpty(),
        check('licenseIssuedDate','License issued date is mandatory').not().isEmpty(),
        check('carType','Have to enter your car type').not().isEmpty(),
        check('drivingExperience', 'Driving experience in years is required').not().isEmpty(),
        check('location','Location (city) is required').not().isEmpty(),
    ], 
    async(req, res) => {
    //when request is received, validate the driver data before proceeding further
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      //if there were some errors in the data received send the 400 response with the error message
      return res.status(400).json({ errors: errors.array() });
    } else {
      //if data is correct, add the driver
      try {
        //destructure the parameters
        const {name,password,rate,licenseIssuedDate,carType,drivingExperience,location} = req.body;
        let {email} = req.body;
        email = email.toLowerCase();
        //find whether driver with entered email has already registered
        let driver= await Driver.findOne({email});

         //if the driver already exists in the system then return from here
        if(driver){
            return res.status(400).json({ errors: [{ msg: 'Driver already exists in the system' }] });
        }
        //if this is the new driver then create new driver
        driver=new Driver({name,email,password,rate,licenseIssuedDate,carType,drivingExperience,location,rating:0});

        //generate salt and hash the password of the drvier for protection
        const hashSalt = await bcrypt.genSalt(10);
        driver.password = await bcrypt.hash(password, hashSalt);

        //update the database
        await driver.save();
        //creating jwt token
        const payload = {
            user: {
              /*this id is not in the model, however MongoDB generates object id with every record
              and mongoose provide an interface to use _id as id without using underscore*/
              id: driver.id,
            },
          };
          //get jwt, json web token
          fn.createJwtToken(payload, res);
      }
      catch(err){
        res.status(500).json({ errors: err.message });
      }
    }
}
);

// @route Post api/driver/login
// @desc authenticate user to login
// @access Public
router.post(
    '/login',
    [
      //check if the driver provided the values
      check('email', 'Email is required').isEmail(),
      check('password', 'Password is required').exists(),
    ],
    async (req, res) => {
      //when request is received, validate the driver data before proceeding further
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        //if there were some errors in the data received send the 400 response with the error message
        return res.status(400).json({ errors: errors.array() });
      } else {
        //if data is correct, then log driver
        try {
          //destructure the parameters
          const { password } = req.body;
          let {email} = req.body;
          email = email.toLowerCase();
          //find the driver with the email entered
          let driver = await Driver.findOne({ email });
  
          //if the driver already exists in the system then return from here
          if (!driver) {
            return res.status(400).json({ errors: [{ msg: 'Invalid Credentials' }] });
          }
          // check if the password entered password is correct or not by using bcrypt
          const valid = await bcrypt.compare(password, driver.password);
  
          if (!valid) {
            return res.status(400).json({ errors: [{ msg: 'Invalid Credentials' }] });
          }
  
          //create a payload to be used by jwt to create hash
          const payload = {
            user: {
              /*this id is not in the model, however MongoDB generates object id with every record
              and mongoose provide an interface to use _id as id without using underscore*/
              id: driver.id,
            },
          };
          //get jwt, json web token
          fn.createJwtToken(payload, res);
        } catch (err) {
          res.status(500).json({ errors: err.message });
        }
      }
    }
);

// @route GET api/driver/view/:driver_id
// @desc View Driver Profile functionality by using jwt login token
// @access private
// router.get('/view/:driver_id', auth, async(req,res) =>{
//   try{
//     const id=req.params.driver_id;
//     //pass the driver_id as parameter
//     const driver = await Driver.findOne({_id:id}).select('-password');
//     if(!driver){
//       //if there is no driver data
//       return res.status(400).json({msg:'Driver data not found'});
//     }
//     //send driver data as response
//     res.json(driver);
//   }
//   catch(err){
//     if(err.kind=='ObjectId'){
//       return res.status(400).json({msg:'Driver data not found'});
//     }
//     res.status(500).send('Server Error');
//   }
// });

// @route POST api/drivers/update
// @desc Update driver profile functionality
// @access public
router.post('/update', routeAuth,[
  //validate the request parameters sent by the client
  check('email', 'Enter a valid email').isEmail(), //use validator to validate an email
  ], async(req,res) =>{
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
    //if there were some errors in the data received send the 400 response with the error message
    return res.status(400).json({ errors: errors.array() });
    }
    try{
    //get the user containing the id from the request which we got after routeAuth was run
    let driver = req.user;
      //read the updates from request body
      const updates=req.body;
      //if the driver already exists in the system then return from here
      let existing = await Driver.find({ email:updates.email });
      if (existing.length > 0 && existing[0]._id != driver.id) {
        return res
          .status(400)
          .json({ errors: [{ msg: 'Another account already exists with this email!' }] });
      }
      //in mongoose, the updated values won't appear immediately current post request
      //to get new updated values to post request we need to set options to true
      const options= {new:true};
      update = await Driver.findByIdAndUpdate(driver.id,updates,options);
      if(!update){
        //If there is no driver data
        return res.status(400).json({msg:'Update failed'});
      }
      update = ({...update}._doc);
      delete update.password;
      //send driver data as response
      res.status(200).json(update);
    }
    catch(err){
      res.status(500).send('Server Error');
    }
});

// @route POST api/drivers/updatePassword
// @desc View driver profile functionality by using jwt login token
// @access public
router.post('/updatePassword', routeAuth,[
  //validate the request parameters sent by the client
  check('oldPassword','Current password required!').not().isEmpty(),
  check('newPassword', 'Password should have at least 8 chars!').custom((value)=>{
    return !(typeof value == typeof undefined || value == null || value.length < 8);
  }),
  check('confirmPassword','Passwords do not match!').custom((value,{req})=>{
    return value == req.body.newPassword;
  }),
  check('oldPassword','Current and new passwords cannot be same!').custom((value,{req})=>{
    return !(value == req.body.newPassword)
  })
], async(req,res) =>{
    //when request is received, validate the user data before proceeding further
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      //if there were some errors in the data received send the 400 response with the error message
      return res.status(400).json({ errors: errors.array() });
    }else{
    try{
    //get the user containing the id from the request which we got after routeAuth was run
    let driver = req.user;
      //read the updates from request body
      const {oldPassword, newPassword}=req.body;
      if(oldPassword===newPassword)
      {
        return res.status(401).json({errors:[{msg:"New Password must not equal to old password"}]});
      }
      driver = await Driver.findById(driver.id);
      if(driver){
        // check if the password and entered password is correct or not by using bcrypt
        const valid = await bcrypt.compare(oldPassword, driver.password);
        if(valid){
          const hashSalt = await bcrypt.genSalt(10);
          const password = await bcrypt.hash(newPassword, hashSalt);
          //update the password and save it to database
          driver.password=password;
          await driver.save();
          driver = ({...driver}._doc);
          delete driver.password;
          //return the updated user for demonstrating purposes
          return res.status(200).json(driver);
        }
        //when user enters wrong password while deleting the account
        return res.status(401).json({errors:[{msg:"Incorrect Password!"}]})
      }
      return res.status(400).json({errors:[{msg:"Cannot find the driver!"}]})
    
    }
    catch(err){
      res.status(500).send('Server Error');
    }
  }  
});

// @route GET api/drivers/logout
// @desc logout functionality by checking the blacklist jwt
// @access Public
router.get('/logout', async (req, res) => {
  try {
    //call method to invalidate the jwt token by blacklisting it using DB
    fn.logout(req, res);
  } catch (err) {
    //something happened at the server side
    res.status(500).json({ errors: [{ msg: err.message }] });
  }
});

// @route Delete api/drivers
// @desc delete functionality to delete the driver profile.
// @access Public
router.delete('/', routeAuth, async(req, res) =>{
  try{
    //get the user containing the id from the request which we got after routeAuth was run
    let driver = req.user;
    const {password} = req.body;
    //get the user data from the database so that we can check whether the password user entered is right or not
    driver = await Driver.findById(driver.id);
    if(driver){
      // check if the password entered password is correct or not by using bcrypt
      const valid = await bcrypt.compare(password, driver.password);
      if(valid){
        driver = await Driver.findByIdAndDelete(driver.id);
        driver = ({...driver}._doc);
        delete driver.password;
        //return the deleted user for demonstrating purposes
        return res.status(200).json(driver);
      }
      //when user enters wrong password while deleting the account
      return res.status(401).json({errors:[{msg:"Incorrect Password!"}]})
    }
    return res.status(400).json({errors:[{msg:"Cannot find the driver!"}]})
  } catch (err) {
    //prints the error message if it fails to delete the driver profile.
    res.status(500).json({errors: [{msg: err.message}] });
  }
});

// @route PUT api/drivers/
// @desc Provide availability for next 7 days;
// @access Public
router.put('/', routeAuth, async(req, res) =>{
  try{
    //check if it is Sunday so that user cannot update on any other day
    //===>>>   0 = Sunday
    
    if(new Date().getDay() !== 0){
      return res.status(400).json({errors: [{msg: "Cannot update on any other day but Sunday"}] });
    }
    availability = req.body.availability
    if(availability.length != 7){
      return res.status(400).json({errors:[{msg:"Week's availability is required!"}]});
    }
    //get the user containing the id from the request which we got after routeAuth was run
    let driver = req.user;
    //get the user data from the database so that we can check whether the password user entered is right or not
    driver = await Driver.findById(driver.id);
    if(driver){
        currentAvailability = await fn.updateOrCreateAvailability(availability,driver,res);
        return res.json(currentAvailability);
      }
     res.status(400).json({errors:[{msg:"Cannot find the driver!"}]})
  } catch (err) {
    //prints the error message if it fails to delete the driver profile.
    res.status(500).json({errors: [{msg: err.message}] });
  }
});

// @route PUT api/drivers/bookingProposal
// @desc Respond to the request made by the user for a service;
// @access Public
router.put('/bookingProposal/:id/:accept', async(req, res) =>{
  try{
    const jwtToken = req.params.id;
    expiredToken = await BlackList.findOne({token:jwtToken});
    if(expiredToken)
      return res.status(400).json({errors:[{msg:"Link cannot be used again!"}]});
    const accept = req.params.accept;
    //verify the token fetched using secret Key
    const jwtObject = jwt.verify(jwtToken, config.get('jwtForBooking')); 
    const bookingId = jwtObject.booking.id;
    const bookerEmail = jwtObject.booking.bookerEmail;
    //remove the booking request if drivers rejects it otherwise update the status and send the mail to booker in both cases
    //get the bookings for the booker
    bookings = await Bookings.findOne({bookerEmail})
    let thisBooking;
    //if driver accepted the request
    if(accept == 'true'){
      bookings.bookings = bookings.bookings.map((value)=>{
        if(String(value._id) == String(bookingId))
        {
          thisBooking = value;
          value.status = 1;
        }
        return value;
      })
    }
    //if driver rejected the request
    else{
      bookings.bookings = bookings.bookings.filter((value)=> {
        if(String(value._id) != String(bookingId)){
          return true;
        }
        else{
          thisBooking = value;
        }
      })
    }
    //add the token to the blacklist as it cannot be used again
    blacklist = new BlackList({token:jwtToken});
    await blacklist.save();
    await bookings.save();
    //send mail to the user accordingly 
    let result;
    if(accept == 'true'){
      result = await fn.sendAcceptanceMail(thisBooking.driverName,bookerEmail,thisBooking.pickUp,thisBooking.drop,thisBooking.date,thisBooking.motive,thisBooking.startTime,"Driver",res);
    }
    else{
      result = await fn.sendRejectionMail(thisBooking.driverName,bookerEmail,thisBooking.pickUp,thisBooking.drop,thisBooking.date,thisBooking.motive,thisBooking.startTime,"Driver",res);
    }
    let msg;
    if(result >= 200 && result <= 300)
      msg = 'Email sent!';
    res.status(200).json({accept,msg});
  } catch (err) {
    //prints the error message if it fails to delete the driver profile.
    res.status(500).json({errors: [{msg: err.message}] });
  }
});

module.exports = router;

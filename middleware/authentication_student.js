const jwt = require('jsonwebtoken')
const {UnauthenticatedError} = require('../errors')

const auth = (req,res,next) => {
  // check header
  const authHeader = req.headers.authorization
  if(!authHeader || !authHeader.startsWith('Bearer'))
  {
    throw new UnauthenticatedError('Authentication invalid')
  }
  const token = authHeader.split(' ')[1]
  try{
    const payload = jwt.verify(token,process.env.JWT_SECRET_STUDENT)
    // attach the user to the job routes
    req.user = {studentId:payload.sid}

  }catch(error){
    throw new UnauthenticatedError('Authentication invalid')
  }
  next()
}

module.exports = auth
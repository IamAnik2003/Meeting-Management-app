const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const bcrypt = require('bcryptjs');
const conn = require("./db/db.connect");
const User = require("./db/User");
const mongoose = require("mongoose");

const app = express();
conn();
dotenv.config();

const port = process.env.PORT || 3050;
const secret = process.env.SECRET_KEY;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============ HELPER FUNCTIONS ============
const getUserByEmail = async (email) => {
  return await User.findOne({ email }).select('_id firstname lastname');
};

const isValidUrl = (string) => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

const validateEventData = (data) => {
  const requiredFields = {
    userId: "User ID",
    eventTopic: "Event topic",
    hostName: "Host name",
    dateTime: "Date and time",
    timezone: "Timezone",
    duration: "Duration",
    meetingLink: "Meeting link"
  };

  const missingFields = Object.entries(requiredFields)
    .filter(([field]) => !data[field])
    .map(([_, name]) => name);

  if (missingFields.length > 0) {
    return { valid: false, message: `Missing required fields: ${missingFields.join(', ')}` };
  }

  if (data.meetingLink && !isValidUrl(data.meetingLink)) {
    return { valid: false, message: "Invalid meeting link format. Please provide a valid URL." };
  }

  return { valid: true };
};

// ============ AUTHENTICATION ROUTES ============
app.get("/", (req, res) => {
  res.send("Hello, World!");
});

app.post("/api/register", async (req, res) => {
  const { firstname, lastname, email, password } = req.body;
  
  try {
    const userExist = await User.findOne({ email });
    if (userExist) {
      return res.status(400).json({ message: "User already exists" });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      firstname,
      lastname,
      email,
      password: hashedPassword,
    });
    await newUser.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Error registering user" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const newuser = await User.findOne({ email });

    if (!newuser) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, newuser.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const payload = {
      firstname: newuser.firstname,
      email: newuser.email,
      password: newuser.password,
      username: newuser.username,
    };
    const token = jwt.sign(payload, secret, { expiresIn: "1d" });

    res.status(200).json({
      token,
      fullname: newuser.firstname + " " + newuser.lastname,
      username: newuser.username,
      email: newuser.email,
      userID: newuser._id,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Error logging in" });
  }
});

app.patch("/api/updateprofile", async (req, res) => {
  const { email, firstname, lastname, password, newEmail } = req.body;
  
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
    }
    user.firstname = firstname;
    user.lastname = lastname;
    user.email = newEmail;
    await user.save();
    res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ message: "Something went wrong" });
  }
});

app.post("/api/tell-us-yourname", async (req, res) => {
  try {
    const { email, username, category } = req.body;
    const existingUser = await User.findOne({ username });

    if (existingUser) {
      return res.status(400).json({
        message: "Username already exists. Please choose a different username.",
      });
    }

    const loggedUser = await User.findOne({ email });
    if (!loggedUser) {
      return res.status(404).json({ message: "User not found." });
    }

    loggedUser.username = username;
    loggedUser.category = category;
    await loggedUser.save();

    res.status(200).json({ message: "Data saved successfully!" });
  } catch (error) {
    console.error("Error saving data:", error);
    res.status(500).json({ message: "An error occurred while saving data." });
  }
});

// ============ EVENT MANAGEMENT ROUTES ============

// Create event with participant status tracking
app.post("/api/events", async (req, res) => {
  try {
    const { 
      userId,
      eventTopic,
      hostName,
      description,
      date,
      time,
      ampm,
      timezone,
      duration,
      bannerColor,
      meetingLink,
      participants,
      password,
      teamName,
      dateTime
    } = req.body;

    // Validate required fields
    const validation = validateEventData(req.body);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check for duplicate meeting link for this user
    const existingEventWithLink = user.events.find(e => 
      e.meetingLink && e.meetingLink === meetingLink
    );
    
    if (existingEventWithLink) {
      return res.status(400).json({ 
        message: "This meeting link is already associated with another event" 
      });
    }

    // Process participants - ensure host is included and marked
    const processedParticipants = (participants || []).map(p => ({
      email: p.email,
      status: p.isHost ? 'host' : 'pending',
      userId: p.isHost ? userId : null
    }));

    // Ensure host is always included
    const hasHost = processedParticipants.some(p => p.status === 'host');
    if (!hasHost) {
      processedParticipants.push({
        email: user.email,
        status: 'host',
        userId: userId
      });
    }

    // Create new event object
    const newEvent = {
      eventTopic,
      hostName: hostName || `${user.firstname} ${user.lastname}`,
      description: description || "",
      dateTime: new Date(dateTime || Date.now()),
      timezone: timezone || "IST",
      duration: Number(duration || 1),
      bannerColor: bannerColor || "#342B26",
      meetingLink: meetingLink,
      password: password || "",
      teamName: teamName || "Team A Meeting-1",
      createdBy: userId,
      status: 'active',
      isActive: true,
      createdAt: new Date(),
      participants: processedParticipants
    };

    // Log the event being created
    console.log("Creating event with meeting link:", meetingLink);
    console.log("Event password:", password);

    // Add to user's events
    const result = await User.findByIdAndUpdate(
      userId,
      { $push: { events: newEvent } },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get the newly added event (last one in array)
    const createdEvent = result.events[result.events.length - 1];

    res.status(201).json({ 
      message: "Event created successfully",
      event: createdEvent
    });

  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({ 
      message: "Error creating event", 
      error: error.message 
    });
  }
});

// Get single event by ID
app.get("/api/events/:eventId", async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const event = user.events.id(req.params.eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.status(200).json(event);
  } catch (error) {
    console.error("Error getting event:", error);
    res.status(500).json({ message: "Error getting event" });
  }
});

// Get meeting details with access control
app.get("/api/events/:eventId/meeting-details", async (req, res) => {
  try {
    const { userId } = req.query;
    const eventId = req.params.eventId;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is the host
    const hostedEvent = user.events.id(eventId);
    if (hostedEvent) {
      return res.status(200).json({
        meetingLink: hostedEvent.meetingLink,
        password: hostedEvent.password || "",
        isHost: true,
        hasAccess: true
      });
    }

    // Check participant events
    const participantEvent = user.participantEvents.id(eventId);
    if (participantEvent) {
      // Only return meeting details if accepted
      if (participantEvent.participationStatus === 'accepted') {
        // Get the full event details from host's events
        const host = await User.findOne({ "events._id": eventId });
        if (host) {
          const event = host.events.id(eventId);
          if (event) {
            return res.status(200).json({
              meetingLink: event.meetingLink,
              password: event.password || "",
              isHost: false,
              hasAccess: true
            });
          }
        }
      }
      
      return res.status(403).json({ 
        message: "You need to accept the invitation to view meeting details",
        hasAccess: false
      });
    }

    return res.status(404).json({ message: "Event not found" });
  } catch (error) {
    console.error("Error getting meeting details:", error);
    res.status(500).json({ message: "Error getting meeting details" });
  }
});

app.get("/api/users/:userId/bookingevents", async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 1. Get hosted events (events where user is the host)
    const hostedEvents = await User.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(userId) } },
      { $unwind: "$events" },
      {
        $lookup: {
          from: "users",
          localField: "events.participants.userId",
          foreignField: "_id",
          as: "participantDetails"
        }
      },
      {
        $addFields: {
          "events.participants": {
            $map: {
              input: "$events.participants",
              as: "participant",
              in: {
                $mergeObjects: [
                  "$$participant",
                  {
                    userDetails: {
                      $arrayElemAt: [
                        "$participantDetails",
                        {
                          $indexOfArray: [
                            "$participantDetails._id",
                            "$$participant.userId"
                          ]
                        }
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      },
      { $replaceRoot: { newRoot: "$events" } }
    ]);

    // 2. Get participant events (events where user is a participant but not host)
    const allParticipantEvents = await User.aggregate([
      { $match: { "events.participants.email": user.email } },
      { $unwind: "$events" },
      {
        $match: {
          "events.createdBy": { $ne: new mongoose.Types.ObjectId(userId) },
          "events.participants": {
            $elemMatch: {
              $or: [
                { userId: new mongoose.Types.ObjectId(userId) },
                { email: user.email }
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "events.createdBy",
          foreignField: "_id",
          as: "hostDetails"
        }
      },
      {
        $addFields: {
          "events.hostDetails": { $arrayElemAt: ["$hostDetails", 0] },
          "events.participationStatus": {
            $let: {
              vars: {
                participant: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: "$events.participants",
                        as: "p",
                        cond: {
                          $or: [
                            { $eq: ["$$p.userId", new mongoose.Types.ObjectId(userId)] },
                            { $eq: ["$$p.email", user.email] }
                          ]
                        }
                      }
                    },
                    0
                  ]
                }
              },
              in: "$$participant.status"
            }
          }
        }
      },
      { $replaceRoot: { newRoot: "$events" } }
    ]);

    // 3. Update user's participantEvents array (only with new events)
    if (allParticipantEvents.length > 0) {
      const newParticipantEvents = allParticipantEvents.filter(event => 
        !user.participantEvents.some(pe => pe._id.equals(event._id))
      ).map(event => ({
        ...event,
        participationStatus: event.participationStatus,
        // Only include meeting details if accepted
        ...(event.participationStatus === 'accepted' ? {
          meetingLink: event.meetingLink,
          password: event.password || ""
        } : {})
      }));

      if (newParticipantEvents.length > 0) {
        await User.updateOne(
          { _id: userId },
          { $addToSet: { participantEvents: { $each: newParticipantEvents } } }
        );
      }
    }
    
    // 4. Get the updated participantEvents from the user document
    const updatedUser = await User.findById(userId);
    
    res.status(200).json({
      hostedEvents,
      participantEvents: updatedUser.participantEvents
    });

  } catch (error) {
    console.error("Error getting booking events:", error);
    res.status(500).json({ 
      message: "Error getting booking events",
      error: error.message 
    });
  }
});

// Get all events with optional filtering (maintains backward compatibility)
app.get("/api/users/:userId/events", async (req, res) => {
  try {
    const { status } = req.query;
    const now = new Date();
    const userId = req.params.userId;

    // Original behavior when no status filter is provided
    if (!status) {
      const user = await User.findById(userId).select("events");
      if (!user) return res.status(404).json({ message: "User not found" });
      return res.status(200).json(user.events);
    }

    // New filtering behavior when status is specified
    let eventsFilter = {};
    
    switch (status) {
      case 'upcoming':
        eventsFilter = {
          'dateTime': { $gt: now },
          'status': 'active',
          'participants': {
            $elemMatch: {
              $or: [
                { userId: new mongoose.Types.ObjectId(userId), status: 'accepted' },
                { userId: new mongoose.Types.ObjectId(userId), status: 'host' }
              ]
            }
          }
        };
        break;
      
      case 'pending':
        eventsFilter = {
          'dateTime': { $gt: now },
          'participants': {
            $elemMatch: {
              userId: new mongoose.Types.ObjectId(userId),
              status: 'pending'
            }
          }
        };
        break;
      
      case 'canceled':
        eventsFilter = {
          $or: [
            { 'status': 'canceled' },
            { 
              'participants': {
                $elemMatch: {
                  userId: new mongoose.Types.ObjectId(userId),
                  status: 'rejected'
                }
              }
            }
          ]
        };
        break;
      
      case 'past':
        eventsFilter = { 'dateTime': { $lt: now } };
        break;
      
      default:
        return res.status(400).json({ message: "Invalid status filter" });
    }

    const user = await User.findOne(
      { _id: userId },
      { events: { $elemMatch: eventsFilter } }
    ).populate({
      path: 'events',
      populate: [
        { path: 'createdBy', select: 'firstname lastname email' },
        { path: 'participants.userId', select: 'firstname lastname email' }
      ]
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user.events || []);
  } catch (error) {
    console.error("Error getting events:", error);
    res.status(500).json({ message: "Error getting events" });
  }
});

// Update event
app.put("/api/events/:eventId", async (req, res) => {
  try {
    const { userId, ...updateData } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (updateData.dateTime) {
      updateData.dateTime = new Date(updateData.dateTime);
    }

    // Validate meeting link if provided
    if (updateData.meetingLink && !isValidUrl(updateData.meetingLink)) {
      return res.status(400).json({ 
        message: "Invalid meeting link format. Please provide a valid URL." 
      });
    }

    // Get the existing event first to preserve createdBy and check for duplicates
    const user = await User.findOne({ _id: userId, "events._id": req.params.eventId });
    if (!user) {
      return res.status(404).json({ message: "User or event not found" });
    }

    const existingEvent = user.events.id(req.params.eventId);
    if (!existingEvent) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check for duplicate meeting link (excluding the current event)
    if (updateData.meetingLink) {
      const duplicateEvent = user.events.find(e => 
        e.meetingLink === updateData.meetingLink && 
        e._id.toString() !== req.params.eventId
      );
      
      if (duplicateEvent) {
        return res.status(400).json({ 
          message: "This meeting link is already associated with another event" 
        });
      }
    }

    // Preserve the createdBy field from the existing event
    updateData.createdBy = existingEvent.createdBy || userId;

    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, "events._id": req.params.eventId },
      { $set: { "events.$": { ...existingEvent.toObject(), ...updateData } }},
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.status(200).json({ 
      message: "Event updated successfully",
      event: updatedUser.events.id(req.params.eventId)
    });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ message: "Error updating event" });
  }
});

// Update event status (active/inactive)
app.patch("/api/events/:eventId/status", async (req, res) => {
  try {
    const { userId, isActive } = req.body;
    const eventId = req.params.eventId;

    // Validate input
    if (!userId || typeof isActive !== 'boolean') {
      return res.status(400).json({ message: "Invalid request data" });
    }

    // Find and update the event
    const result = await User.findOneAndUpdate(
      { 
        _id: userId,
        "events._id": eventId 
      },
      { 
        $set: { 
          "events.$.isActive": isActive 
        } 
      },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Find the updated event to return
    const updatedEvent = result.events.find(e => e._id.toString() === eventId);
    
    res.status(200).json({ 
      message: "Event status updated successfully",
      event: updatedEvent
    });
  } catch (error) {
    console.error("Error updating event status:", error);
    res.status(500).json({ 
      message: "Error updating event status",
      error: error.message 
    });
  }
});

// Delete event
app.delete("/api/events/:eventId", async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const result = await User.updateOne(
      { _id: userId },
      { $pull: { events: { _id: req.params.eventId } } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.status(200).json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({ message: "Error deleting event" });
  }
});

// Update participant event status
app.patch('/api/users/:userId/participant-events/:eventId', async (req, res) => {
  try {
    const { userId, eventId } = req.params;
    const { participationStatus } = req.body;

    if (!participationStatus) {
      return res.status(400).json({ message: "Participation status is required" });
    }

    // Get the event details from host
    const host = await User.findOne({ "events._id": eventId });
    if (!host) {
      return res.status(404).json({ message: "Event not found" });
    }

    const event = host.events.id(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Find the participant's email
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update in participant's events array with meeting details if accepted
    const updateData = {
      "participantEvents.$.participationStatus": participationStatus
    };

    // Only add meeting details if accepted
    if (participationStatus === 'accepted') {
      updateData["participantEvents.$.meetingLink"] = event.meetingLink;
      updateData["participantEvents.$.password"] = event.password || "";
    } else {
      updateData["participantEvents.$.meetingLink"] = null;
      updateData["participantEvents.$.password"] = null;
    }

    await User.updateOne(
      { 
        _id: userId,
        "participantEvents._id": eventId 
      },
      { $set: updateData }
    );

    // Also update in host's events participants array
    await User.updateOne(
      { 
        "events._id": eventId,
        "events.participants.email": user.email 
      },
      { 
        $set: { 
          "events.$.participants.$.status": participationStatus 
        } 
      }
    );

    // Return updated participant events
    const updatedUser = await User.findById(userId);
    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(updatedUser.participantEvents);
  } catch (error) {
    console.error("Error updating participant event:", error);
    res.status(500).json({ message: error.message });
  }
});

// GET user by email
app.get('/api/users/by-email', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email }).select('firstname lastname');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      fullName: `${user.firstname} ${user.lastname || ''}`.trim(),
      firstname: user.firstname,
      lastname: user.lastname || ''
    });
  } catch (error) {
    console.error('Error finding user by email:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update categorized events
app.patch('/api/users/:userId/categorized-events', async (req, res) => {
  try {
    const { upcomingEvents, pendingEvents, canceledEvents, pastEvents, participantEvents } = req.body;
    const userId = req.params.userId;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          upcoming: upcomingEvents || [],
          pending: pendingEvents || [],
          canceled: canceledEvents || [],
          past: pastEvents || [],
          participantEvents: participantEvents || []
        }
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Error updating categorized events:", error);
    res.status(500).json({ message: error.message });
  }
});

// Update user availability
app.put('/api/users/:userId/availability', async (req, res) => {
  try {
    const { weeklyHours, timezone } = req.body;

    // Validate data
    if (!weeklyHours || !Array.isArray(weeklyHours)) {
      console.log("Validation failed: weeklyHours is not an array");
      return res.status(400).json({ error: 'Invalid data format: weeklyHours must be an array' });
    }

    // Additional validation for weeklyHours
    for (const dayData of weeklyHours) {
      if (!dayData.day || !['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].includes(dayData.day)) {
        console.log("Validation failed: Invalid day", dayData);
        return res.status(400).json({ error: `Invalid day: ${dayData.day}` });
      }
      if (typeof dayData.available !== 'boolean') {
        console.log("Validation failed: available must be a boolean", dayData);
        return res.status(400).json({ error: `Invalid available value for ${dayData.day}: must be a boolean` });
      }
      if (!Array.isArray(dayData.timings)) {
        console.log("Validation failed: timings must be an array", dayData);
        return res.status(400).json({ error: `Invalid timings for ${dayData.day}: must be an array` });
      }
      for (const timing of dayData.timings) {
        if (!timing.from || !timing.to) {
          console.log("Validation failed: timing missing from/to", timing);
          return res.status(400).json({ error: `Invalid timing for ${dayData.day}: from and to are required` });
        }
      }
    }

    // Ensure the availability field exists
    const user = await User.findById(req.params.userId);
    if (!user) {
      console.log("User not found:", req.params.userId);
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.availability) {
      user.availability = { weeklyHours: [], timezone: 'Indian Time Standard' };
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.userId,
      {
        $set: {
          'availability.weeklyHours': weeklyHours,
          'availability.timezone': timezone || 'Indian Time Standard',
          'availability.lastUpdated': new Date(),
        },
      },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      console.log("User not found after update:", req.params.userId);
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(updatedUser.availability);
  } catch (error) {
    console.error("Error updating availability:", error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get user availability
app.get('/api/users/:userId/availability', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('availability');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user.availability || { 
      weeklyHours: [],
      timezone: "Indian Time Standard"
    });
  } catch (error) {
    console.error("Error getting availability:", error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ ERROR HANDLING MIDDLEWARE ============
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ 
    message: "Internal server error",
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============ START SERVER ============
app.listen(port, () => {
  console.log(`Server is running on port http://localhost:${port}`);
});

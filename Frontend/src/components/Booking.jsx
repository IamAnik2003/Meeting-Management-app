import React, { useState, useEffect } from "react";
import styles from "../components/Booking.module.css";
import people from "../assets/people.png";
import copy from "../assets/copy.png";
import remove from "../assets/delete.png";
import toast from "react-hot-toast";
import axios from "axios";
import avatar from "../assets/avater.png";
import accept from "../assets/accept.png";
import reject from "../assets/reject.png";

export default function Booking() {
  const [activeTab, setActiveTab] = useState("Upcoming");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showParticipantsDialog, setShowParticipantsDialog] = useState(false);
  const [currentParticipants, setCurrentParticipants] = useState([]);
  const VITE_BACK_URL = import.meta.env.VITE_BACK_URL;
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMeetingDetails, setShowMeetingDetails] = useState({});
  const [meetingDetails, setMeetingDetails] = useState({});
  const [deletedEvents, setDeletedEvents] = useState({});

  const [allEvents, setAllEvents] = useState({
    upcoming: [],
    pending: [],
    canceled: [],
    past: [],
    participantEvents: []
  });

  const saveCategorizedEvents = async (eventsToSave) => {
    try {
      const userId = localStorage.getItem("userID");
      if (!userId) throw new Error("User not logged in");
  
      const dataToSave = eventsToSave || allEvents;
      
      await axios.patch(
        `${VITE_BACK_URL}/api/users/${userId}/categorized-events`,
        {
          upcomingEvents: dataToSave.upcoming,
          pendingEvents: dataToSave.pending,
          canceledEvents: dataToSave.canceled,
          pastEvents: dataToSave.past,
          participantEvents: dataToSave.participantEvents || []
        }
      );
  
      toast.success("Events saved successfully");
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Failed to save events");
      throw err;
    }
  };

  const fetchParticipantDetails = async (participants, eventId) => {
    try {
      const enrichedParticipants = await Promise.all(
        participants.map(async (participant) => {
          let enrichedParticipant = { ...participant };

          if (!participant.userId || !participant.userId._id) {
            try {
              const response = await axios.get(
                `${VITE_BACK_URL}/api/users/by-email`,
                { params: { email: participant.email } }
              );
              enrichedParticipant.userId = {
                ...(participant.userId || {}),
                _id: response.data._id,
                firstname: response.data.firstname,
                lastname: response.data.lastname,
              };
            } catch (err) {
              console.error(`Failed to fetch user details for ${participant.email}:`, err);
            }
          }

          const event = allEvents.participantEvents.find(e => e._id === eventId);
          if (event && event.participants) {
            const participantInEvent = event.participants.find(p => 
              p.email === participant.email || (p.userId && p.userId._id === enrichedParticipant.userId?._id)
            );
            enrichedParticipant.participationStatus = participantInEvent?.participationStatus || "pending";
          }

          return enrichedParticipant;
        })
      );

      return enrichedParticipants;
    } catch (error) {
      console.error("Error fetching participant details:", error);
      return participants;
    }
  };

  const fetchMeetingDetails = async (eventId) => {
    try {
      const userId = localStorage.getItem("userID");
      const response = await axios.get(
        `${VITE_BACK_URL}/api/events/${eventId}/meeting-details`,
        { params: { userId } }
      );
      
      if (response.data.hasAccess) {
        setMeetingDetails(prev => ({
          ...prev,
          [eventId]: {
            meetingLink: response.data.meetingLink,
            password: response.data.password,
            isHost: response.data.isHost
          }
        }));
        setShowMeetingDetails(prev => ({
          ...prev,
          [eventId]: true
        }));
      } else if (response.data.isDeleted) {
        toast.error("This event has been deleted");
        setDeletedEvents(prev => ({ ...prev, [eventId]: true }));
      } else {
        toast.error("You need to accept the invitation to view meeting details");
      }
    } catch (error) {
      console.error("Error fetching meeting details:", error);
      if (error.response?.status === 403) {
        if (error.response?.data?.isDeleted) {
          toast.error("This event has been deleted");
          setDeletedEvents(prev => ({ ...prev, [eventId]: true }));
        } else {
          toast.error("You need to accept the invitation to view meeting details");
        }
      } else {
        toast.error("Failed to fetch meeting details");
      }
    }
  };

  const toggleMeetingDetails = (eventId) => {
    if (deletedEvents[eventId]) {
      toast.error("This event has been deleted");
      return;
    }
    setShowMeetingDetails(prev => ({
      ...prev,
      [eventId]: !prev[eventId]
    }));
    
    if (!meetingDetails[eventId]) {
      fetchMeetingDetails(eventId);
    }
  };

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success(`${type} copied to clipboard`))
      .catch(() => toast.error(`Failed to copy ${type}`));
  };

  const updateParticipantStatus = async (eventId, status) => {
    let previousEvents = { ...allEvents };
    try {
      setIsProcessing(true);
      const userId = localStorage.getItem("userID");

      // Check if event is deleted
      const event = allEvents.participantEvents.find(e => e._id === eventId);
      if (event && event.isDeleted) {
        toast.error("This event has been deleted");
        return;
      }

      const updatedParticipantEvents = allEvents.participantEvents.map(event =>
        event._id === eventId ? { ...event, participationStatus: status } : event
      );
      
      const now = new Date();
      const tempCategorizedEvents = {
        upcoming: [
          ...allEvents.upcoming.filter(event => event._id !== eventId && !event.isDeleted),
          ...(status === "accepted" && updatedParticipantEvents.find(e => e._id === eventId && new Date(e.dateTime) > now && !e.isDeleted) 
            ? [updatedParticipantEvents.find(e => e._id === eventId)] : [])
        ],
        pending: allEvents.pending.filter(event => event._id !== eventId && !event.isDeleted),
        canceled: [
          ...allEvents.canceled,
          ...(status === "rejected" ? [updatedParticipantEvents.find(e => e._id === eventId)] : [])
        ],
        past: allEvents.past,
        participantEvents: updatedParticipantEvents
      };
      setAllEvents(tempCategorizedEvents);

      await axios.patch(
        `${VITE_BACK_URL}/api/users/${userId}/participant-events/${eventId}`,
        { participationStatus: status }
      );
  
      const response = await axios.get(
        `${VITE_BACK_URL}/api/users/${userId}/bookingevents`
      );
      
      const categorizedEvents = {
        upcoming: [
          ...response.data.hostedEvents.filter(event => 
            new Date(event.dateTime) > now && 
            event.status !== 'canceled' &&
            !event.isDeleted
          ),
          ...response.data.participantEvents.filter(event => 
            event.participationStatus === 'accepted' && 
            new Date(event.dateTime) > now &&
            !event.isDeleted
          )
        ],
        pending: response.data.participantEvents.filter(event => 
          event.participationStatus === 'pending' &&
          new Date(event.dateTime) > now &&
          !event.isDeleted
        ),
        canceled: [
          ...response.data.hostedEvents.filter(event => event.status === "canceled"),
          ...response.data.participantEvents.filter(event => 
            event.participationStatus === 'rejected' ||
            (event.participationStatus === 'pending' && new Date(event.dateTime) <= now)
          )
        ],
        past: [
          ...response.data.hostedEvents.filter(event => 
            new Date(event.dateTime) <= now && 
            event.status !== 'canceled' &&
            !event.isDeleted
          ),
          ...response.data.participantEvents.filter(event => 
            new Date(event.dateTime) <= now &&
            event.participationStatus === 'accepted' &&
            !event.isDeleted
          )
        ],
        participantEvents: response.data.participantEvents
      };
  
      setAllEvents(categorizedEvents);
      await saveCategorizedEvents(categorizedEvents);
  
      toast.success(`Event ${status}`);
    } catch (err) {
      console.error("Status update error:", err);
      if (err.response?.status === 403) {
        toast.error("This event has been deleted");
        setDeletedEvents(prev => ({ ...prev, [eventId]: true }));
        // Remove from pending
        setAllEvents(prev => ({
          ...prev,
          pending: prev.pending.filter(e => e._id !== eventId)
        }));
      } else {
        setAllEvents(previousEvents);
        toast.error(`Failed to ${status} event: ${err.response?.data?.message || err.message}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAcceptEvent = (eventId) => updateParticipantStatus(eventId, "accepted");
  const handleRejectEvent = (eventId) => updateParticipantStatus(eventId, "rejected");

  const formatDate = (dateString) => {
    const options = { weekday: "long", day: "numeric", month: "short" };
    return new Date(dateString).toLocaleDateString("en-US", options);
  };

  const formatTime = (dateString, duration) => {
    const date = new Date(dateString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const formattedHours = hours % 12 || 12;

    const endTime = new Date(date.getTime() + duration * 60 * 60 * 1000);
    const endHours = endTime.getHours();
    const endFormattedHours = endHours % 12 || 12;
    const endAmpm = endHours >= 12 ? "PM" : "AM";

    return `${formattedHours}:${minutes
      .toString()
      .padStart(2, "0")} ${ampm} - ${endFormattedHours}:${endTime
      .getMinutes()
      .toString()
      .padStart(2, "0")} ${endAmpm}`;
  };

  const showParticipants = async (participants, eventId) => {
    try {
      setIsLoading(true);
      const enrichedParticipants = await fetchParticipantDetails(participants, eventId);
      setCurrentParticipants(enrichedParticipants);
      setShowParticipantsDialog(true);
    } catch (error) {
      console.error("Error showing participants:", error);
      setCurrentParticipants(participants);
      setShowParticipantsDialog(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const fetchAllEvents = async () => {
      try {
        setIsLoading(true);
        const userId = localStorage.getItem("userID");
        if (!userId) throw new Error("User not logged in");
    
        const response = await axios.get(
          `${VITE_BACK_URL}/api/users/${userId}/bookingevents`
        );
        const { hostedEvents, participantEvents } = response.data;
        const now = new Date();
    
        const categorizedEvents = {
          upcoming: [
            ...hostedEvents.filter(event => 
              new Date(event.dateTime) > now && 
              event.status !== 'canceled' &&
              !event.isDeleted
            ),
            ...participantEvents.filter(event => 
              event.participationStatus === 'accepted' && 
              new Date(event.dateTime) > now &&
              !event.isDeleted
            )
          ],
          pending: participantEvents.filter(event => 
            event.participationStatus === 'pending' &&
            new Date(event.dateTime) > now &&
            !event.isDeleted
          ),
          canceled: [
            ...hostedEvents.filter(event => event.status === "canceled"),
            ...participantEvents.filter(event => 
              event.participationStatus === 'rejected' ||
              (event.participationStatus === 'pending' && new Date(event.dateTime) <= now)
            )
          ],
          past: [
            ...hostedEvents.filter(event => 
              new Date(event.dateTime) <= now && 
              event.status !== 'canceled' &&
              !event.isDeleted
            ),
            ...participantEvents.filter(event => 
              new Date(event.dateTime) <= now &&
              event.participationStatus === 'accepted' &&
              !event.isDeleted
            )
          ],
          participantEvents: participantEvents
        };
  
        setAllEvents(categorizedEvents);
        await saveCategorizedEvents(categorizedEvents);
      } catch (err) {
        console.error("Fetch error:", err.response?.data || err.message);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAllEvents();
  }, [VITE_BACK_URL, showParticipantsDialog]);

  const MeetingDetails = ({ eventId }) => {
    const details = meetingDetails[eventId];
    if (!details) return null;

    return (
      <div className={styles.meetingDetails}>
        <div className={styles.meetingLinkContainer}>
          <span className={styles.meetingLabel}>Meeting Link:</span>
          <div className={styles.linkWrapper}>
            <a 
              href={details.meetingLink} 
              target="_blank" 
              rel="noopener noreferrer"
              className={styles.meetingLink}
            >
              {details.meetingLink}
            </a>
            <button 
              className={styles.copyButton}
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard(details.meetingLink, "Meeting link");
              }}
            >
              📋
            </button>
          </div>
        </div>
        {details.password && (
          <div className={styles.passwordContainer}>
            <span className={styles.passwordLabel}>Password:</span>
            <div className={styles.passwordWrapper}>
              <span className={styles.password}>{details.password}</span>
              <button 
                className={styles.copyButton}
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(details.password, "Password");
                }}
              >
                📋
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const UpcomingComponent = () => {
    if (isLoading) return <div className={styles.loading}>Loading events...</div>;
    if (error) return <div className={styles.error}>Error: {error}</div>;
    if (allEvents.upcoming.length === 0) {
      return <div className={styles.noEvents}>No upcoming events found</div>;
    }

    return (
      <div className={styles.upcomingCon}>
        {allEvents.upcoming.map((event) => {
          const isParticipant = event.participationStatus === 'accepted';
          const isHost = event.createdBy === localStorage.getItem("userID");
          const canViewMeeting = isHost || isParticipant;
          const isDeleted = event.isDeleted || false;

          return (
            <div 
              key={event._id} 
              className={`${styles.upcoming} ${isDeleted ? styles.deletedEvent : ''}`}
              style={isDeleted ? { opacity: 0.6, pointerEvents: 'none' } : {}}
            >
              <div className={styles.p1}>
                <div className={styles.date}>
                  {formatDate(event.dateTime)}
                  {isDeleted && <span className={styles.deletedTag}> (Deleted)</span>}
                </div>
                <div className={styles.description}>{event.eventTopic}</div>
                <div className={styles.time}>
                  {formatTime(event.dateTime, event.duration)}
                </div>
                <div className={styles.teamName}>
                  {event.createdBy === localStorage.getItem("userID")
                    ? `You and ${event.teamName || "Team"}`
                    : `Invited by ${event.hostName}`}
                </div>
              </div>
              <div className={styles.p2}>
                <div className={`${styles.accepted} ${isDeleted ? styles.deletedStatus : ''}`}>
                  <p>{isDeleted ? 'Deleted' : 'Accepted'}</p>
                </div>
                <div
                  className={styles.people}
                  onClick={() => !isDeleted && showParticipants(event.participants || [], event._id)}
                  style={isDeleted ? { cursor: 'not-allowed' } : {}}
                >
                  <img src={people} alt="People" />
                  <p>{event.participants?.length || 0} people</p>
                </div>
                {canViewMeeting && !isDeleted && (
                  <button
                    className={styles.meetingButton}
                    onClick={() => toggleMeetingDetails(event._id)}
                  >
                    <span>🔗</span>
                    <span>Meeting</span>
                  </button>
                )}
              </div>
              {showMeetingDetails[event._id] && !isDeleted && (
                <MeetingDetails eventId={event._id} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const PendingComponent = () => {
    if (isLoading) return <div className={styles.loading}>Loading events...</div>;
    if (error) return <div className={styles.error}>Error: {error}</div>;
    if (allEvents.pending.length === 0) {
      return <div className={styles.noEvents}>No pending events found</div>;
    }

    return (
      <div className={styles.upcomingCon}>
        {allEvents.pending.map((event) => {
          const isDeleted = event.isDeleted || false;
          
          return (
            <div 
              key={event._id} 
              className={`${styles.upcoming} ${isDeleted ? styles.deletedEvent : ''}`}
              style={isDeleted ? { opacity: 0.6, pointerEvents: 'none' } : {}}
            >
              <div className={styles.p1}>
                <div className={styles.date}>
                  {formatDate(event.dateTime)}
                  {isDeleted && <span className={styles.deletedTag}> (Deleted)</span>}
                </div>
                <div className={styles.description}>{event.eventTopic}</div>
                <div className={styles.time}>
                  {formatTime(event.dateTime, event.duration)}
                </div>
                <div className={styles.teamName}>
                  {event.createdBy === localStorage.getItem("userID")
                    ? `You and ${event.teamName || "Team"}`
                    : `Invited by ${event.hostName}`}
                </div>
              </div>
              <div className={styles.p2}>
                <div
                  className={styles.people}
                  onClick={() => !isDeleted && showParticipants(event.participants || [], event._id)}
                  style={isDeleted ? { cursor: 'not-allowed' } : {}}
                >
                  <img src={people} alt="People" />
                  <p>{event.participants?.length || 0} people</p>
                </div>
                {!isDeleted && (
                  <div className={styles.btns}>
                    <button
                      className={styles.reject}
                      onClick={() => handleRejectEvent(event._id)}
                      disabled={isProcessing}
                    >
                      <img src={reject} alt="Reject" />
                      <p>Reject</p>
                    </button>
                    <button
                      className={styles.accept}
                      onClick={() => handleAcceptEvent(event._id)}
                      disabled={isProcessing}
                    >
                      <img src={accept} alt="Accept" />
                      <p>Accept</p>
                    </button>
                  </div>
                )}
                {isDeleted && (
                  <div className={styles.deletedBadge}>
                    <span>Event Deleted</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const CanceledComponent = () => {
    if (isLoading) return <div className={styles.loading}>Loading events...</div>;
    if (error) return <div className={styles.error}>Error: {error}</div>;
    if (allEvents.canceled.length === 0) {
      return <div className={styles.noEvents}>No canceled events found</div>;
    }

    return (
      <div className={styles.upcomingCon}>
        {allEvents.canceled.map((event) => (
          <div key={event._id} className={styles.upcoming}>
            <div className={styles.p1}>
              <div className={styles.date}>{formatDate(event.dateTime)}</div>
              <div className={styles.description}>{event.eventTopic}</div>
              <div className={styles.time}>
                {formatTime(event.dateTime, event.duration)}
              </div>
              <div className={styles.teamName}>
                {event.createdBy === localStorage.getItem("userID")
                  ? `You and ${event.teamName || "Team"}`
                  : `Invited by ${event.hostName}`}
              </div>
            </div>
            <div className={styles.p2}>
              <div className={styles.rejected}>
                <p>Rejected</p>
              </div>
              <div
                className={styles.people}
                onClick={() => showParticipants(event.participants || [], event._id)}
              >
                <img src={people} alt="People" />
                <p>{event.participants?.length || 0} people</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const PastComponent = () => {
    if (isLoading) return <div className={styles.loading}>Loading events...</div>;
    if (error) return <div className={styles.error}>Error: {error}</div>;
    if (allEvents.past.length === 0) {
      return <div className={styles.noEvents}>No past events found</div>;
    }

    return (
      <div className={styles.upcomingCon}>
        {allEvents.past.map((event) => (
          <div 
            key={event._id} 
            className={`${styles.upcoming} ${event.isDeleted ? styles.deletedEvent : ''}`}
            style={event.isDeleted ? { opacity: 0.6 } : {}}
          >
            <div className={styles.p1}>
              <div className={styles.date}>
                {formatDate(event.dateTime)}
                {event.isDeleted && <span className={styles.deletedTag}> (Deleted)</span>}
              </div>
              <div className={styles.description}>{event.eventTopic}</div>
              <div className={styles.time}>
                {formatTime(event.dateTime, event.duration)}
              </div>
              <div className={styles.teamName}>
                {event.createdBy === localStorage.getItem("userID")
                  ? `You and ${event.teamName || "Team"}`
                  : `Invited by ${event.hostName}`}
              </div>
            </div>
            <div className={styles.p2}>
              <div className={styles.past}>
                <p>
                  {event.isDeleted ? "Deleted" :
                    event.status === "canceled"
                    ? "Canceled"
                    : event.participationStatus === "rejected"
                    ? "Rejected"
                    : "Completed"}
                </p>
              </div>
              <div
                className={styles.people}
                onClick={() => showParticipants(event.participants || [], event._id)}
              >
                <img src={people} alt="People" />
                <p>{event.participants?.length || 0} people</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "Upcoming":
        return <UpcomingComponent />;
      case "Pending":
        return <PendingComponent />;
      case "Canceled":
        return <CanceledComponent />;
      case "Past":
        return <PastComponent />;
      default:
        return <UpcomingComponent />;
    }
  };

  return (
    <>
      <div className={styles["appearence-container"]}>
        <div className={styles.bookings}>
          <div className={styles.menuCon}>
            <div
              className={`${styles.menu} ${
                activeTab === "Upcoming" ? styles.active : ""
              }`}
              onClick={() => setActiveTab("Upcoming")}
              style={activeTab === "Upcoming" ? { borderBottom: "2px solid #1877F2" } : {}}
            >
              Upcoming
            </div>
            <div
              className={`${styles.menu} ${
                activeTab === "Pending" ? styles.active : ""
              }`}
              onClick={() => setActiveTab("Pending")}
              style={activeTab === "Pending" ? { borderBottom: "2px solid #1877F2" } : {}}
            >
              Pending
            </div>
            <div
              className={`${styles.menu} ${
                activeTab === "Canceled" ? styles.active : ""
              }`}
              onClick={() => setActiveTab("Canceled")}
              style={activeTab === "Canceled" ? { borderBottom: "2px solid #1877F2" } : {}}
            >
              Canceled
            </div>
            <div
              className={`${styles.menu} ${
                activeTab === "Past" ? styles.active : ""
              }`}
              onClick={() => setActiveTab("Past")}
              style={activeTab === "Past" ? { borderBottom: "2px solid #1877F2" } : {}}
            >
              Past
            </div>
          </div>
          <div style={{ width: "100%" }} className={styles.tabContent}>
            <div className={styles.line}></div>
            {renderTabContent()}
          </div>
        </div>
      </div>
      {showParticipantsDialog && (
        <div className={styles.participantsDialog}>
          <div className={styles.dialogHeader}>
            <h3>
              Participants{" "}
              <span style={{ color: "#B6B6B6" }}>{`(${currentParticipants.length})`}</span>
            </h3>
            <button
              className={styles.closeButton}
              onClick={() => setShowParticipantsDialog(false)}
            >
              ×
            </button>
          </div>
          <div className={styles.dialogContent}>
            <div className={styles.participantsList}>
              {currentParticipants.length > 0 ? (
                currentParticipants.map((participant, index) => {
                  let displayName;
                  let isHost = participant.status === "host";

                  if (participant.userId && participant.userId.firstname) {
                    displayName = `${participant.userId.firstname} ${
                      participant.userId.lastname || ""
                    }`.trim();
                  } else {
                    displayName = participant.email;
                  }

                  return (
                    <div key={index} className={styles.participant}>
                      <img src={avatar} alt="Profile" />
                      <div className={styles.participantInfo}>
                        <p className={styles.participantName}>{displayName}</p>
                        {isHost && (
                          <p className={styles.participantEmail}>(Host)</p>
                        )}
                      </div>
                      <div className={styles.check}>
                        <input
                          type="checkbox"
                          checked={participant.participationStatus === "accepted"}
                          disabled
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className={styles.noParticipants}>
                  No participants found
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

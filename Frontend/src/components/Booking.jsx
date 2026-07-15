import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import styles from "./Events.module.css";
import copy from "../assets/copy.png";
import remove from "../assets/delete.png";
import DiolougeBox from "./DiolougeBox";
import conflickt from "../assets/conflickt.png";

export default function Events() {
  const [isDiolougeOpen, setIsDiolougeOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [activeStates, setActiveStates] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [eventToDelete, setEventToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const VITE_BACK_URL = import.meta.env.VITE_BACK_URL;

  // Calculate conflicts between events
  const conflicts = useMemo(() => {
    const conflictMap = {};
    const eventsWithConflicts = [...events].map(event => ({ ...event, hasConflict: false }));

    for (let i = 0; i < eventsWithConflicts.length; i++) {
      const eventA = eventsWithConflicts[i];
      const startA = new Date(eventA.dateTime);
      const endA = new Date(startA.getTime() + eventA.duration * 60 * 60 * 1000);

      for (let j = i + 1; j < eventsWithConflicts.length; j++) {
        const eventB = eventsWithConflicts[j];
        const startB = new Date(eventB.dateTime);
        const endB = new Date(startB.getTime() + eventB.duration * 60 * 60 * 1000);

        // Check if events overlap
        if (startA < endB && startB < endA) {
          eventA.hasConflict = true;
          eventB.hasConflict = true;
          conflictMap[eventA._id] = true;
          conflictMap[eventB._id] = true;
        }
      }
    }

    return conflictMap;
  }, [events]);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const userId = localStorage.getItem("userID");
        if (!userId) throw new Error("User not logged in");
        
        const response = await axios.get(`${VITE_BACK_URL}/api/users/${userId}/events`);
        // Filter out deleted events
        const activeEvents = response.data.filter(event => !event.isDeleted);
        setEvents(activeEvents);
        
        const initialActiveStates = {};
        activeEvents.forEach(event => {
          initialActiveStates[event._id] = event.isActive !== false;
        });
        setActiveStates(initialActiveStates);
      } catch (err) {
        setError(err.message);
        console.error("Error fetching events:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [isDiolougeOpen, VITE_BACK_URL]);

  const handleToggle = async (eventId, e) => {
    e.stopPropagation();
    try {
      const userId = localStorage.getItem("userID");
      const newActiveState = !activeStates[eventId];
      
      await axios.patch(`${VITE_BACK_URL}/api/events/${eventId}/status`, {
        userId,
        isActive: newActiveState
      });

      setActiveStates(prev => ({
        ...prev,
        [eventId]: newActiveState
      }));
    } catch (err) {
      console.error("Error updating status:", err);
      toast.error("Failed to update event status");
    }
  };

  const handleDeleteClick = (eventId, e) => {
    e.stopPropagation();
    setEventToDelete(eventId);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!eventToDelete) return;
    
    try {
      setIsDeleting(true);
      const userId = localStorage.getItem("userID");
      
      // Send delete request to backend
      await axios.delete(`${VITE_BACK_URL}/api/events/${eventToDelete}`, {
        data: { userId }
      });
      
      // Remove from local state
      setEvents(prev => prev.filter(event => event._id !== eventToDelete));
      
      // Remove from active states
      setActiveStates(prev => {
        const newState = { ...prev };
        delete newState[eventToDelete];
        return newState;
      });
      
      toast.success("Event deleted successfully");
      setShowDeleteConfirm(false);
      setEventToDelete(null);
    } catch (err) {
      console.error("Delete error:", err);
      toast.error(err.response?.data?.message || "Failed to delete event");
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setEventToDelete(null);
  };

  const handleEdit = (event, e) => {
    e.stopPropagation();
    setEditingEvent(event);
    setIsDiolougeOpen(true);
  };

  const handleCopyLink = (link, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(link)
      .then(() => toast.success("Link copied to clipboard"))
      .catch(() => toast.error("Failed to copy link"));
  };

  const handleEventClick = (link) => {
    window.open(link, '_blank', 'noopener,noreferrer');
  };

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

    return `${formattedHours}:${minutes.toString().padStart(2, "0")} ${ampm} - ${endFormattedHours}:${endTime.getMinutes().toString().padStart(2, "0")} ${endAmpm}`;
  };

  if (loading) return <div className={styles.loading}>Loading events...</div>;
  if (error) return <div className={styles.error}>Error: {error}</div>;

  return (
    <div>
      <div className={styles["link-container"]}>
        <button
          onClick={(e) => {
            e.preventDefault();
            setEditingEvent(null);
            setIsDiolougeOpen(true);
          }}
          className={styles.createbtn}
        >
          + Create
        </button>
        
        {isDiolougeOpen && (
          <DiolougeBox 
            setIsDiolougeOpen={setIsDiolougeOpen} 
            editingEvent={editingEvent}
          />
        )}
        
        {!isDiolougeOpen && (
          <div className={styles.eventsContainer}>
            {events.length > 0 ? (
              events.map((event) => (
                <div 
                  key={event._id} 
                  className={styles.events}
                  onClick={() => handleEventClick(event.meetingLink)}
                  style={{ cursor: "pointer" }}
                >
                  <div
                    style={{ 
                      background: activeStates[event._id] ? "#1877F2" : "#676767" 
                    }}
                    className={styles.inner}
                  >
                    {conflicts[event._id] && (
                      <div className={styles.conflickCon}>
                        <img src={conflickt} alt="Conflict" />
                        <div className={styles.conflict} style={{display:"flex",alignItems:"center",justifyContent:"center"}}>
                          <p>Conflict of timing</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className={styles.titleContain}>
                    <p>{event.eventTopic}</p>
                    <p 
                      onClick={(e) => handleEdit(event, e)}
                      style={{ cursor: "pointer" }}
                    >
                      ✎
                    </p>
                  </div>
                  <div className={styles.date}>{formatDate(event.dateTime)}</div>
                  <div className={styles.timeDuration}>
                    {formatTime(event.dateTime, event.duration)}
                  </div>
                  <div className={styles.description}>
                    {event.duration}hr
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: "0.4%",
                      background: "#B6B6B6",
                      marginTop: "1%",
                    }}
                  ></div>
                  <div className={styles.btnC}>
                    <label className={styles["switch"]} onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={activeStates[event._id] ?? true}
                        onChange={(e) => handleToggle(event._id, e)}
                        aria-label="Toggle event status" 
                      />
                      <span
                        className={`${styles["slider"]} ${styles["round"]} ${styles["slider-round"]}`}
                      ></span>
                    </label>
                    <img 
                      className={styles.copy} 
                      src={copy} 
                      alt="Copy" 
                      onClick={(e) => handleCopyLink(event.meetingLink, e)}
                      style={{ cursor: "pointer" }}
                    />
                    <img 
                      className={styles.remove} 
                      src={remove} 
                      alt="Delete" 
                      onClick={(e) => handleDeleteClick(event._id, e)}
                      style={{ cursor: "pointer" }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.noEvents}>
                No events found. Create your first event!
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className={styles.modalOverlay} onClick={cancelDelete}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Confirm Delete</h3>
              <button className={styles.modalCloseBtn} onClick={cancelDelete}>×</button>
            </div>
            <div className={styles.modalBody}>
              <p>Are you sure you want to delete this event?</p>
              <p className={styles.modalWarning}>This action cannot be undone and will be reflected for all participants.</p>
            </div>
            <div className={styles.modalFooter}>
              <button 
                className={styles.modalCancelBtn} 
                onClick={cancelDelete}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button 
                className={styles.modalDeleteBtn} 
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

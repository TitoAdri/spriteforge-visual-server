/* X conversion tracking base code */
!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);},s.version="1.1",s.queue=[],u=t.createElement(n),u.async=!0,u.src="https://static.ads-twitter.com/uwt.js",a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,"script");
if (typeof window.twq === "function") window.twq("config","rekew");

window.spriteforgeTrackX = (eventName, parameters = {}) => {
  const eventIds = {
    PageView: "tw-rekew-rekfl",
    SignUp: "tw-rekew-remmz",
    Generate: "tw-rekew-remn0",
    Purchase: "tw-rekew-remn1"
  };
  const eventId = eventIds[eventName];
  if (eventId && typeof window.twq === "function") window.twq("event", eventId, parameters);
};

// Kept as a compatibility alias for older editor modules. X conversion events
// must be sent once per completed action, not once per browser profile.
window.spriteforgeTrackXOnce = window.spriteforgeTrackX;
/* End X conversion tracking base code */

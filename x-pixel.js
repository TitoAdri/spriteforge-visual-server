/* X conversion tracking base code */
!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);},s.version="1.1",s.queue=[],u=t.createElement(n),u.async=!0,u.src="https://static.ads-twitter.com/uwt.js",a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,"script");
if (typeof window.twq === "function") window.twq("config","rekew");

window.spriteforgeTrackX = (eventName, parameters = {}) => {
  const eventIds = {
    PageView: "tw-rekew-rekfl",
    SignUp: "tw-rekew-rekfm",
    Generate: "tw-rekew-rekfq",
    Purchase: "tw-rekew-rekfr"
  };
  const eventId = eventIds[eventName];
  if (eventId && typeof window.twq === "function") window.twq("event", eventId, parameters);
};

window.spriteforgeTrackXOnce = (eventName, parameters = {}) => {
  const key = `spriteforge_x_${eventName}`;
  try { if (window.localStorage.getItem(key)) return; } catch {}
  window.spriteforgeTrackX(eventName, parameters);
  try { window.localStorage.setItem(key, "1"); } catch {}
};
/* End X conversion tracking base code */

// Netlify Scheduled Function: ONE run a night — 11:00 pm IST (17:30 UTC), Mon–Fri,
// live site only. Chief reads the day's EODs, reminds missing EODs, and DMs the PM.
// The work happens in /api/jobs/tick, protected by CRON_SECRET.
const tick = async () => {
  const base = process.env.URL ?? process.env.APP_URL;
  const res = await fetch(`${base}/api/jobs/tick`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  console.log("tick", res.status, (await res.text()).slice(0, 500));
};

export default tick;

export const config = { schedule: "30 17 * * 1-5" };

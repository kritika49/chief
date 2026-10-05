// Netlify Scheduled Function: wakes Chief every 10 minutes (live site only).
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

export const config = { schedule: "*/10 * * * *" };

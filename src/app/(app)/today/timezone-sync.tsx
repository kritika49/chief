"use client";

import { useEffect } from "react";
import { saveTimezone } from "./actions";

export function TimezoneSync() {
  useEffect(() => {
    saveTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);
  return null;
}

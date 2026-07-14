import{describe,expect,it}from"vitest";
import{REMINDER_HORIZON_SECONDS,REMINDER_RETENTION_SECONDS,reminderDelaySeconds}from"../src/lib/reminders";

describe("reminder queue timing",()=>{it("rounds delayed delivery up and makes overdue reminders immediate",()=>{const now=1_000_000;expect(reminderDelaySeconds(new Date(now+1_001),now)).toBe(2);expect(reminderDelaySeconds(new Date(now-1),now)).toBe(0)});it("keeps delayed delivery inside the queue's 24-hour retention limit",()=>{expect(REMINDER_RETENTION_SECONDS).toBe(86_400);expect(REMINDER_HORIZON_SECONDS).toBe(86_340)})});

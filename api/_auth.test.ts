import{afterAll,beforeAll,describe,expect,it,vi}from"vitest";
import{authenticateUser,createSession,readSession,type GitHubUser}from"./_auth";

const user:GitHubUser={id:42,login:"octocat",name:"Octo Cat",avatarUrl:"https://example.com/avatar.png",htmlUrl:"https://github.com/octocat"};
const previous=process.env.SESSION_SECRET;

beforeAll(()=>{process.env.SESSION_SECRET="test-session-secret-with-at-least-32-characters"});
afterAll(()=>{if(previous===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=previous});

describe("signed application sessions",()=>{
 it("round trips a valid user and rejects tampering or expiration",()=>{const now=1_700_000_000_000,session=createSession(user,60,now);expect(readSession(session,now)).toMatchObject({userId:"github:42",user});expect(readSession(`${session.slice(0,-1)}x`,now)).toBeNull();expect(readSession(session,now+61_000)).toBeNull()});
 it("authenticates a signed cookie without calling GitHub",async()=>{const fetchSpy=vi.spyOn(globalThis,"fetch");const session=createSession(user);await expect(authenticateUser({headers:{cookie:`chisel_github_session=${encodeURIComponent(session)}`}})).resolves.toMatchObject({userId:"github:42",user});expect(fetchSpy).not.toHaveBeenCalled();fetchSpy.mockRestore()});
});

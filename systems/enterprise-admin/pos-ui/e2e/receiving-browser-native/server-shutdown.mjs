export async function drainAndCloseServers(drain, servers, close) {
  let drainError = null;
  const closeResults = [];
  try { await drain(); }
  catch (error) { drainError = error; }
  finally {
    for (const server of servers) {
      try { closeResults.push(await close(server)); }
      catch (error) { closeResults.push({ closed: false, error }); }
    }
  }
  return { drainError, closeResults };
}

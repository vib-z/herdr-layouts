// A three-job scene with eight tabs, ten live agents, one child and one remembered exit.
export function sceneFixture() {
  const program = { name: 'Agent', icon: null };
  const plan = [
    ['api', [['token cache', 'working'], ['review policy', 'blocked'], ['schema result', 'done']]],
    ['web', [['login checks', 'working'], ['design question', 'blocked'], ['ready', 'idle']]],
    ['ops', [['auth renewal', 'blocked'], ['cache health', 'working']]],
  ];
  const agents = [], terminals = [], spaces = [];
  let number = 1;
  for (const [name, tabs] of plan) {
    const space = { id: name, name, branch: null, active: name === 'api', tabs: [] };
    for (const [tabName, status] of tabs) {
      const tab = { id: `${name}-${space.tabs.length}`, name: tabName, active: !space.tabs.length, settled: tabName === 'review policy' };
      space.tabs.push(tab);
      const address = `t${number++}`;
      agents.push({ address, pane: `p-${address}`, space: name, space_name: name, tab: tab.id, tab_name: tabName, status, program, title: `Task: ${tabName}` });
      terminals.push({ address, state: 'live', status, program, report: { title: `Task: ${tabName}` } });
    }
    spaces.push(space);
  }
  terminals.push({ address: 't9', parent: 't1', state: 'live', status: 'working', program, report: { title: 'inspect fixture edge cases' } });
  agents.push({ ...agents[0], address: 't10', pane: 'p-t10', title: 'check response contract' });
  terminals.push({ address: 't10', state: 'live', status: 'working', program, report: { title: 'check response contract' } });
  terminals.push({ address: 't11', state: 'live', program: { shell: true } });
  const dead = { ...agents[7], address: 't12', title: 'finish deployment fixture', status: 'dead', lastSeen: 1, exit: { state: 'finished', code: 0, reason: 'exited' } };
  return { agents, terminals, spaces, panes: [], dead };
}

// validate-tasks.mjs failed after the write: put the original file back and tell a human.
const prev = $('Append task node').first();
return [{ json: { restored: true, task_id: prev.json.task_id }, binary: { data: prev.binary.bak } }];

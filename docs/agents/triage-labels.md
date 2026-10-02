# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## 本仓库实际口径

- 分类角色沿用 GitHub 默认的 `bug` / `enhancement`；状态角色按上表原样使用。
- 落 setup 时远端只存在 GitHub 默认标签 + `accessibility`，五个状态角色里只有 `wontfix` 已存在；其余四个**按用即建**（真正需要时 `gh label create`），不预先铺开。
- `ready-for-agent` 语义收窄：只在**真的要让另一个 agent 冷启动认领**时才打；同会话 grill→spec→implement 连推时不打。依据见 `docs/agents/issue-tracker.md` 的「单人 + agent 混合工作流」节。

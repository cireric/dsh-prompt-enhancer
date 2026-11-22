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
- 状态标签缺失时按用即建（`gh label create`），不预先铺开。
- `ready-for-agent` 的移交条件见[工单约定](issue-tracker.md#single-person-workflow-conventions本项目实际运行形态)。

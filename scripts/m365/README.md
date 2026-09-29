# Microsoft 365 scripts

Tools that keep the school's Microsoft 365 tenant in line with the portal
database. Each runs locally, by hand, as a dry run unless told otherwise.

| Folder                            | What it does                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| [`contacts/`](contacts/README.md) | Exchange mail contacts and the "All Teachers" / "All Parents" distribution lists         |
| [`students/`](students/README.md) | Student accounts (Year 3 and up), linked by student code, and their class and year Teams |
| `shared/`                         | Helpers both use: config and `.env` loading, email masking, logging (`Common.ps1`)       |

Each tool has its own README, config, `.env.example` and tests, and runs
from its own folder, e.g.:

```bash
cd scripts/m365/students
pwsh ./sync-students.ps1
```

They share one convention: `CustomAttribute1` on an account or contact
names what manages it (`Teacher`, `Parent`, `Student`), and each tool only
changes what carries its own tags. `students/` checks at start-up that
`contacts/config.psd1` never uses its `Student` tag or attribute.

Run all the tests with:

```bash
for d in contacts students; do (cd scripts/m365/$d && pwsh -c "Invoke-Pester ./tests"); done
```

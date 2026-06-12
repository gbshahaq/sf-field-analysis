# SF Field Analysis

Generate Excel-based documentation for Salesforce object fields to help admins and developers understand complex orgs faster.

# Example Screenshots
Showing multiple Apex and Flow references
<img width="1760" height="589" alt="image" src="https://github.com/user-attachments/assets/9c78e9b8-6ce8-4c9c-84c8-a09c8a0b2fea" />

Surfacing formula field values
<img width="1562" height="433" alt="image" src="https://github.com/user-attachments/assets/a62c1f64-91fd-4ff9-a27d-97a77f4ae1a3" />

Picklist values, dependent fields and Last Modified Date
<img width="1159" height="654" alt="image" src="https://github.com/user-attachments/assets/3d1ad1fc-3112-4df5-a6ae-7f5408a33e95" />



## Overview

When you join a new company or start working in an unfamiliar Salesforce org, one of the first challenges is simply understanding the data model.

Reviewing fields one by one in Setup is slow, repetitive and difficult to share with others. This utility helps by analysing a Salesforce object's fields and publishing the result to Excel, giving you a structured, portable view of the object that is much easier to review, filter and annotate.

The goal is simple: **reduce the time it takes to understand an object in a complex Salesforce org.**

---

## Why this exists

In larger Salesforce implementations, object structures can be difficult to understand quickly. Admins and developers often need answers to questions like:

- What fields exist on this object?
- What customisation has already been added?
- Which areas should I focus on first?
- How can I document this object for analysis or handover?
- How can I share field information outside Salesforce in a format people will actually use?

This project turns that metadata into an Excel-friendly format that supports faster onboarding and easier analysis.

---

## Who this is for

This utility is designed for:

- Salesforce Admins onboarding into a new org
- Salesforce Developers exploring an unfamiliar data model
- Delivery teams doing discovery or impact analysis
- Teams documenting an org for handover, clean-up or governance
- Anyone who prefers reviewing metadata in Excel rather than clicking through Setup

---

## Key use cases

- **New starter onboarding**  
  Get a quicker understanding of a complex object model.

- **Discovery and analysis**  
  Review object fields in a format that is easy to scan and filter.

- **Documentation**  
  Produce a shareable extract of field metadata for team use.

- **Impact assessment**  
  Use the output as a starting point for implementation planning or change analysis.

- **Org clean-up and review**  
  Identify areas that need further investigation or rationalisation.

---

## What the tool does

At a high level, this utility:

1. Connects to Salesforce
2. Analyses a chosen object's fields
3. Produces an Excel output containing the field documentation
4. Makes that output easy to review, filter, share and annotate offline

---

## Benefits

Using Excel as the output format makes the result practical for real project work:

- Easy to review outside Salesforce
- Easy to share with team members and stakeholders
- Easy to filter, sort and annotate
- Useful for workshops, discovery sessions and documentation packs

---

## Example workflow

1. Choose the Salesforce object you want to analyse
2. Run the utility
3. Open the generated Excel file
4. Review, filter and annotate the output as needed

---



## Prerequisites

* Node.js: Version 16 or higher.
* Salesforce CLI (sf): Installed and authenticated with your org.
* TypeScript: Installed globally or via project dependencies.
* Access: API-enabled Salesforce org with appropriate permissions.
* A locally stored copy of a SFDX project repository


## Installation
Clone the repository and install dependencies:

```
git clone https://github.com/gbshahaq/sf-field-analysis.git
cd sf-field-analysis
npm install
```

## Configuration
Before running the tool:

Authenticate your Salesforce org using `sf org login web`

## Usage
Run the CLI tool to analyse fields:
```
# Directly with ts-node
npx ts-node cli.ts <command> [options]

# After build
npm run build
node dist/cli.js <command> [options]

# Alternatively, install with npm then reference it anywhere
# Install globally (from your project directory)
npm i -g .

# Then use the CLI anywhere:
sf-field-analysis -o Case -g MyDev -r $env:USERPROFILE\Projects\SFRepo\force-app\main\default


## Project Structure
```
sf-field-analysis/
  ├── src/
  │   ├── cli.ts          # CLI entry point
  │   ├── services/       # Core logic for field analysis
  │   ├── utils/          # Helper functions
  │   └── reports/        # Report generation logic
  ├── package.json
  └── README.md
```

## Extending the Tool
To add new functionality:

* Create a new service in src/services/.
* Register the command in cli.ts.
* Update documentation and add tests.


## Output

Reports are generated in Excel format for easy review.
Includes object name, field name, properties, picklist and formula values, references to Apex, Flow, page layouts, lightning pages, reports


## Contributing
Contributions are welcome! Please:

* Fork the repository.
* Create a feature branch.
* Submit a pull request with proper documentation and tests.


## License
This project is licensed under the MIT License.

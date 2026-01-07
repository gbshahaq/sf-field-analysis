# SF Field Analysis
## Overview
SF Field Analysis is a Salesforce-focused utility designed to analyse metadata and field usage across your Salesforce organisation. It helps adminis and developers identify unused fields, optimise data models, and maintain a clean, efficient Salesforce environment.
This tool is particularly useful for:

* Auditing where fields are used and referenced
* Identifying redundant or obsolete fields.
* Supporting data governance and optimisation efforts.

## Features

* Field Usage Analysis: Detect fields that are rarely or never used.
* Metadata Extraction: Pull field-level metadata for objects.
* Customisable Reports: Generate detailed reports for decision-making.
* CLI Support: Run commands directly from the terminal for automation.


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
```
Example Commands
```
# Analyse all fields in a Salesforce org
npx ts-node cli.ts analyse --targetOrg myOrgAlias
# Generate a report for unused fields
npx ts-node cli.ts report --output unused-fields.csv

# Analyze Opportunity fields and export both Excel and CSV
npx ts-node cli.ts analyse -o Opportunity -g DevHub -r /Users/you/repo/force-app/main/default --csv",
     
```

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
Includes object name, field name, usage statistics, and recommendations.


## Contributing
Contributions are welcome! Please:

* Fork the repository.
* Create a feature branch.
* Submit a pull request with proper documentation and tests.


## License
This project is licensed under the MIT License.

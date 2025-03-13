import { config } from "dotenv"
import inquirer from "inquirer"
import chalk from "chalk"
import stringify from "json-stringify-pretty-compact"
import figlet from "figlet"
import { accessControlConditions } from "./types/constants.js"
import { EasLitClient, EncryptedAttestation } from "./easClient.js"
import { ethers } from "ethers"
import { UnifiedAccessControlConditions } from "@lit-protocol/types"
import {
  uint8arrayFromString,
  uint8arrayToString,
} from "@lit-protocol/lit-node-client"
import { AnonAadhaarProof } from "./types/index.js"

config()

const displayTitle = () => {
  console.log(
    chalk.cyan(
      figlet.textSync("ATTESTIFY", {
        font: "Banner3-D",
        horizontalLayout: "default",
        verticalLayout: "default",
        whitespaceBreak: true,
      })
    )
  )
}

const run = async () => {
  displayTitle()

  console.log(chalk.blue("Creating EAS x LIT client"))

  const etherWallet = new ethers.Wallet(process.env.PRIVATE_KEY!)
  const client = new EasLitClient({
    network: "sepolia",
    wallet: etherWallet,
  })
  console.log(chalk.green("Connected"))

  const mainMenu = async () => {
    // Main menu for the user to choose an action
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: chalk.cyan("Select an action:"),
        choices: [
          "Create Schema",
          "Resolve Schema",
          "Create Gated Attestation",
          "Resolve Gated Attestation",
          "Revoke Attestation",
          "Exit",
        ],
      },
    ])

    switch (action) {
      case "Create Schema":
        await createSchemaMenu()
        break
      case "Resolve Schema":
        await resolveSchemaMenu()
        break
      case "Create Gated Attestation":
        await createGatedAttestationMenu()
        break
      case "Resolve Gated Attestation":
        await resolveGatedAttestationMenu()
        break
      case "Revoke Attestation":
        await revokeAttestationMenu()
        break
      case "Exit":
        console.log(chalk.yellow("Exiting..."))
        process.exit(0)
    }
  }

  // Create schema menu
  const createSchemaMenu = async () => {
    const { schemaName } = await inquirer.prompt([
      {
        type: "input",
        name: "schemaName",
        message: chalk.cyan("Enter schema name:"),
        default: "TestBioDM1",
      },
    ])

    const { schema } = await inquirer.prompt([
      {
        type: "input",
        name: "schema",
        message: chalk.cyan("Enter schema (comma-separated):"),
        validate: (input) => {
          if (input.trim() === "") return "Keys cannot be empty."
          return true
        },
      },
    ])

    console.log(chalk.blue(`Creating schema: ${schemaName}`))
    const createSchemaRes = await client.createSchema(schema)

    console.log(chalk.green("Schema Created:"))
    console.log(chalk.green(stringify(createSchemaRes, { maxLength: 50 })))

    await mainMenu()
  }

  // Resolve schema menu (dummy example)
  const resolveSchemaMenu = async () => {
    const { schemaId } = await inquirer.prompt([
      {
        type: "input",
        name: "schemaId",
        message: chalk.cyan("Enter schema ID to resolve:"),
      },
    ])
    try {
      console.log(chalk.blue(`Resolving schema with ID: ${schemaId}`))
      const resolveSchemaRes = await client.getSchema({ uid: schemaId })
      console.log(
        chalk.green(stringify(resolveSchemaRes.schema, { maxLength: 50 }))
      )
    } catch (err) {
      console.log(chalk.red(err))
    }
    await mainMenu()
  }

  // Create Gated Attestation menu
  const createGatedAttestationMenu = async () => {
    const { schemaId } = await inquirer.prompt([
      {
        type: "input",
        name: "schemaId",
        message: chalk.cyan("Enter schema ID to create attestation for:"),
      },
    ])

    console.log(chalk.blue(`Resolving schema with ID: ${schemaId}`))
    const resolveSchemaRes = await client.getSchema({ uid: schemaId })
    console.log(
      chalk.green(stringify(resolveSchemaRes.schema, { maxLength: 50 }))
    )

    const schemaData = resolveSchemaRes.schema
    // Extract the field names from the schema response
    const schemaFields: string[] = schemaData
      .split(",")
      .map((fields) => fields.split(" ")[1])

    // Dynamically generate the prompt questions based on the fields
    const questions = schemaFields.map((field) => ({
      type: "input",
      name: field,
      message: chalk.cyan(`Enter value for ${field}:`),
    }))

    // Include schemaId in the prompt answers
    const answers = await inquirer.prompt(questions as any)

    const data = Object.fromEntries(
      schemaFields.map((field) => [field, answers[field]])
    )

    // Start building the access conditions
    const accessConditions = []
    const remainingConditions = accessControlConditions
    let addMore = true

    while (addMore) {
      // Prompt user to select a condition
      const { selectedConditionName } = await inquirer.prompt([
        {
          type: "list",
          name: "selectedConditionName",
          message: chalk.cyan("Select an access control condition:"),
          choices: remainingConditions.map((condition) => condition.name),
        },
      ])

      // Find the selected condition object
      const selectedIndex = remainingConditions.findIndex(
        (condition) => condition.name === selectedConditionName
      )

      if (selectedIndex !== -1) {
        accessConditions.push(
          remainingConditions.splice(selectedIndex, 1)[0].condition
        )
      } else {
        console.log(chalk.red("Invalid condition selected. Try again."))
        continue
      }

      // Ask if the user wants to add another condition
      if (remainingConditions.length == 0) {
        addMore = false
      } else {
        const { addAnother } = await inquirer.prompt([
          {
            type: "confirm",
            name: "addAnother",
            message: chalk.cyan("Do you want to add another condition?"),
            default: false,
          },
        ])

        if (addAnother) {
          // If adding another, prompt for a logical operator
          const { operator } = await inquirer.prompt([
            {
              type: "list",
              name: "operator",
              message: chalk.cyan(
                "Select a logical operator to combine conditions:"
              ),
              choices: ["AND", "OR"],
            },
          ])

          // Add the operator to the array
          accessConditions.push({ operator: operator.toLowerCase() })
        } else {
          addMore = false
        }
      }
    }

    console.log(chalk.blue("Selected Access Conditions:"))
    console.log(chalk.green(stringify(accessConditions, { maxLength: 50 })))
    console.log(chalk.blue("Creating attestation..."))
    const createAttestationRes = await client.createAttestation(
      data,
      schemaId,
      {
        gated: true,
        accessControlConditions: accessConditions,
      }
    )

    console.log(chalk.green("Attestation Created:"))
    console.log(chalk.green(stringify(createAttestationRes, { maxLength: 50 })))

    await mainMenu()
  }

  // Resolve Gated Attestation menu
  const resolveGatedAttestationMenu = async () => {
    const { attestationId } = await inquirer.prompt([
      {
        type: "input",
        name: "attestationId",
        message: chalk.cyan("Enter attestation ID to resolve:"),
      },
    ])

    console.log(chalk.blue("Verifying Gated attestation..."))
    try {
      // fetch encrypted attestation
      const { decodedData } = (await client.getAttestation(attestationId, {
        gated: false,
      })) as { decodedData: EncryptedAttestation }

      console.log(chalk.blue("The following condition should be satisfied"))
      const conditions = JSON.parse(
        decodedData.conditions
      ) as UnifiedAccessControlConditions
      console.log(chalk.green(stringify(conditions)))

      let resources: string[] = []
      // if conditions need params get them from user
      if (
        decodedData.conditions.includes(":litParam") &&
        decodedData.conditions.includes("Aadhaar")
      ) {
        // TODO: make it dynamic, Specific to Anon Aadhaar for now
        // const input = await inquirer.prompt([
        //   {
        //     type: "input",
        //     name: "proof",
        //     message: chalk.cyan("Paste your Aadhaar ZK Proof:"),
        //   },
        // ])

        try {
          //   const proof = JSON.parse(input.proof) as AnonAadhaarProof

          const proof: AnonAadhaarProof = {
            groth16Proof: {
              pi_a: [
                "453522302728711170662034996164523811948049632505189552777865030348476378333",
                "1455520893906633969052880329423132015380962295747599422399582082698437183912",
                "1",
              ],
              pi_b: [
                [
                  "1853457071436444831465227056594151003084081362032976862728653223335906539602",
                  "3965652666125386377173350237323832110258916721670646802630361326324683624082",
                ],
                [
                  "1056484870984136939654587035178792542792627275167890019897546039621076240385",
                  "13594899366205476732285060187416718452942220504188020474899201556378142257379",
                ],
                ["1", "0"],
              ],
              pi_c: [
                "9270450197135104109231418725762584718131404367638713051632603041782173293367",
                "6993302625899139560892286625084309725826361987332724770207177146099019232487",
                "1",
              ],
              protocol: "groth16",
              curve: "bn128",
            },
            pubkeyHash:
              "15134874015316324267425466444584014077184337590635665158241104437045239495873",
            timestamp: "1733578200",
            nullifierSeed: "1234",
            nullifier:
              "13814867142699877741266914456770721337120552143355576531328009120994951746374",
            signalHash:
              "10010552857485068401460384516712912466659718519570795790728634837432493097374",
            ageAbove18: "0",
            gender: "0",
            pincode: "0",
            state: "0",
          }

          //   console.log(chalk.green("Parsed proof:"), proof)
          // add resources to be passed as params
          console.log(proof.nullifierSeed)
          resources = [
            `litParam:nullifierSeed:${uint8arrayToString(
              uint8arrayFromString(proof.nullifierSeed),
              "base64url"
            )}`,
            `litParam:nullifier:${uint8arrayToString(
              uint8arrayFromString(proof.nullifier),
              "base64url"
            )}`,
            `litParam:timestamp:${uint8arrayToString(
              uint8arrayFromString(proof.timestamp),
              "base64url"
            )}`,
            `litParam:revealArray:${uint8arrayToString(
              uint8arrayFromString(
                `[${proof.ageAbove18},${proof.gender},${proof.pincode},${proof.state}]`
              ),
              "base64url"
            )}`,
            `litParam:groth16Proof:${uint8arrayToString(
              uint8arrayFromString(
                `[${proof.groth16Proof.pi_a[0]},${proof.groth16Proof.pi_a[1]},${proof.groth16Proof.pi_b[0][1]},${proof.groth16Proof.pi_b[0][0]},${proof.groth16Proof.pi_b[1][1]},${proof.groth16Proof.pi_b[1][0]},${proof.groth16Proof.pi_c[0]},${proof.groth16Proof.pi_c[1]}]`
              ),
              "base64url"
            )}`,
          ]
          console.log(chalk.green(`${resources.length} params added`))
        } catch (error) {
          console.error(chalk.red(error))
          return
        }
      }

      const getAttestationRes = await client.getAttestation(attestationId, {
        gated: true,
        resources,
      })

      console.log(chalk.green("Attestation Resolved:"))
      console.log(chalk.green(stringify(getAttestationRes.decodedData)))
    } catch (err) {
      console.log(err)
      console.log(chalk.red(typeof err === "string" ? err : stringify(err)))
    }
    await mainMenu()
  }

  // Revoke Attestation menu
  const revokeAttestationMenu = async () => {
    const { attestationId, reason } = await inquirer.prompt([
      {
        type: "input",
        name: "attestationId",
        message: chalk.cyan("Enter attestation ID to revoke:"),
      },
      {
        type: "input",
        name: "reason",
        message: chalk.cyan("Enter reason for revocation:"),
        default: "Test revocation",
      },
    ])

    console.log(chalk.blue("Revoking attestation..."))
    const revokeAttestationRes = await client.revokeAttestation(attestationId, {
      reason: reason,
    })

    console.log(chalk.green("Attestation Revoked:"))
    console.log(chalk.green(stringify(revokeAttestationRes, { maxLength: 50 })))

    await mainMenu()
  }

  // Start the main menu loop
  await mainMenu()
}

// Graceful shutdown on force close (e.g., Ctrl+C)
process.on("SIGINT", () => {
  console.log(chalk.yellow("\nGracefully shutting down. Goodbye!"))
  process.exit(0)
})

// Catch unhandled promise rejections
process.on("unhandledRejection", (reason) => {
  console.log(chalk.red("\nUnhandled Rejection. Exiting gracefully..."))
  console.error(reason)
  process.exit(1)
})

// Catch uncaught exceptions
process.on("uncaughtException", (error) => {
  console.log(chalk.red("\nUncaught Exception. Exiting gracefully..."))
  process.exit(1)
})

run()

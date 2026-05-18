https://docs.arc.io/

P2P Payments

Copy page

Build instant, low-cost peer-to-peer payment flows with stablecoin-native transfers and deterministic finality on Arc.

Documentation Index
Fetch the complete documentation index at: https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.

Build direct, peer-to-peer payment flows using stablecoins on Arc. P2P payments let users send value directly to each other without an intermediary, settled onchain in under a second. From simple transfers to full checkout experiences with crosschain bridging using App Kit, Arc provides the infrastructure for fast, low-cost, compliant payments.
For merchant-facing checkout flows, see eCommerce Checkout. For cross-currency swaps between stablecoins, see Stablecoin FX.
​
Sample apps
Production-ready examples on GitHub you can fork and customize.
Arc commerce
Accept USDC payments for in-app purchases using Circle Developer Controlled Wallets, Next.js, and Supabase.
Arc multichain wallet
Unified USDC balance and crosschain transfers using Circle Gateway, Next.js, and Supabase.
Arc fintech
Multichain treasury system with crosschain capital movement using Circle Developer-Controlled Wallets, Gateway, and Bridge Kit.
​
Quickstarts
Get up and running with payment flows in minutes.
Send tokens
Beginner. Transfer stablecoins between wallets using App Kit.
Bridge tokens across blockchains
Beginner. Move USDC across blockchains using App Kit.
Unified Balance deposit and spend
Intermediate. Aggregate USDC across blockchains into a single spendable balance with Unified Balance, which consolidates multichain USDC into one virtual balance.
​
Why Arc for payments
Arc is purpose-built for stablecoin finance. These capabilities directly support payment applications.
Sub-second finality

Deterministic finality — the guarantee that a confirmed transaction cannot be reversed or reorganized — means payments confirm in under a second, giving senders and recipients immediate certainty.
Near-zero gas fees

USDC-denominated gas at stable, predictable prices keeps transaction costs minimal. See gas and fees for current rates.
Native compliance hooks

Built-in integration points for transaction monitoring and wallet screening from providers like Elliptic and TRM Labs.
Multi-stablecoin support

Native support for USDC and EURC. See contract addresses for token details, and use App Kit Swap to exchange between currencies.
Deterministic ordering

Transaction ordering guarantees prevent front-running and ensure payments settle in the order they are submitted. Learn more about Arc’s consensus layer.
Standard EVM tooling

Full EVM compatibility means your existing Solidity, Hardhat, and Foundry workflows work unchanged. Deploy on Arc to get started.
Create your first ERC-8183 job
Connect to Arc

Copy page

Set up your wallet and configure your development environment for Arc Testnet.

Documentation Index
Fetch the complete documentation index at: https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.

Connect a wallet to Arc Testnet using one-click setup or manual configuration.
​
Wallet setup
Use the button below to add Arc Testnet to your wallet automatically.
Adds the network configuration and connects your account.
Connect Wallet
​
Manual setup
Arc uses USDC as the native gas token (18 decimals). If your wallet supports custom gas tokens, ensure display/decimals are set correctly. Wallets that don’t support custom gas tokens still work for signing and sending transactions — balances may display as “ETH” but the underlying token is USDC. See Gas and fees for details.
MetaMask
Rabby
Coinbase Wallet
Rainbow
1
Open network settings

Open MetaMask → Settings → Networks → Add network → Add a network manually.
2
Enter network details

Field	Value
Network name	Arc Testnet
New RPC URL	https://rpc.testnet.arc.network
Chain ID	5042002
Currency symbol	USDC
Explorer URL	https://testnet.arcscan.app
3
Save and switch

Click Save, then switch to Arc Testnet.
​
Network details
Parameter	Value
Network	Arc Testnet
Chain ID	5042002
Currency	USDC
Explorer	testnet.arcscan.app
Faucet	faucet.circle.com
​
RPC endpoints

Primary

Blockdaemon

dRPC

QuickNode
https://rpc.testnet.arc.network
​
WebSocket endpoints

Primary

dRPC

QuickNode
wss://rpc.testnet.arc.network
Sample apps
Deploy on Arc
Deploy on Arc

Copy page

Learn how to deploy, test, and interact with a Solidity smart contract on the Arc Testnet.

Documentation Index
Fetch the complete documentation index at: https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.

Arc is currently in its testnet phase. During this period, the network may experience instability or unplanned downtime. Note: Throughout this page, all references to Arc refer specifically to the Arc Testnet.
In this tutorial, you’ll use Solidity and Foundry to write, deploy, and interact with a simple smart contract on the Arc Testnet.
​
What you’ll learn
By the end of this tutorial, you’ll be able to:
Set up your development environment
Configure Foundry to connect with Arc
Implement your smart contract
Deploy your contract to Arc Testnet
Interact with your deployed contract
​
Set up your development environment
Before you deploy to Arc, you need a working development environment. In this step, you install Foundry, a portable Ethereum development toolkit, and initialize a new Solidity project.
Install Development Tools
# Download foundry installer `foundryup`
curl -L https://foundry.paradigm.xyz | bash
Install binaries
# Install forge, cast, anvil, chisel
foundryup
Initialize a new Solidity Project
forge init hello-arc && cd hello-arc
​
Configure Foundry to interact with Arc
In this step, you set up Foundry to connect to the Arc network by adding Arc’s RPC URLs to your project environment.
Create a .env file
Open the hello-arc project in your preferred code editor (for example, VS Code). Then, create a new file named .env in the root of the project directory.
Add the Arc Testnet RPC URL
Paste the following environment variable into the .env file:
ARC_TESTNET_RPC_URL="https://rpc.testnet.arc.network"
This URL allows Foundry to connect to the Arc Testnet.
Never commit your .env file to version control. Store private keys and sensitive variables securely.
​
Implement your smart contract
In this step, you create the HelloArchitect contract, update the test and script files, and compile the project.
HelloArchitect is a simple storage contract that manages a greeting message: it starts with a default greeting, lets you update it, and emits an event whenever the greeting changes.
​
1. Write the HelloArchitect contract
First, delete the default Counter.sol template file from the /src directory:
rm src/Counter.sol
Next, create a new file named HelloArchitect.sol inside the /src directory, and add the following code:
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract HelloArchitect {
    string private greeting;

    // Event emitted when the greeting is changed
    event GreetingChanged(string newGreeting);

    // Constructor that sets the initial greeting to "Hello Architect!"
    constructor() {
        greeting = "Hello Architect!";
    }

    // Setter function to update the greeting
    function setGreeting(string memory newGreeting) public {
        greeting = newGreeting;
        emit GreetingChanged(newGreeting);
    }

    // Getter function to return the current greeting
    function getGreeting() public view returns (string memory) {
        return greeting;
    }
}
This contract includes a private greeting variable that stores the greeting string, along with two public functions:
setGreeting updates the greeting value and emits the GreetingChanged event
getGreeting returns the current value of greeting
​
2. Update scripts and tests
Since you deleted Counter.sol, you need to remove or replace any scripts and tests that reference it to avoid compilation errors.
Delete the script directory
The script directory includes files that reference Counter.sol. Since you’ve removed Counter.sol, delete the entire script directory to avoid compilation errors:
rm -rf script
You can recreate this directory later with updated deployment scripts for your own contracts.
Replace Counter.t.sol with HelloArchitect.t.sol
Navigate to the /test directory, delete the existing Counter.t.sol file, and create a new test file named HelloArchitect.t.sol. Then, add the following test cases to validate your contract:
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../src/HelloArchitect.sol";

contract HelloArchitectTest is Test {
    HelloArchitect helloArchitect;

    function setUp() public {
        helloArchitect = new HelloArchitect();
    }

    function testInitialGreeting() public view {
        string memory expected = "Hello Architect!";
        string memory actual = helloArchitect.getGreeting();
        assertEq(actual, expected);
    }

    function testSetGreeting() public {
        string memory newGreeting = "Welcome to Arc Chain!";
        helloArchitect.setGreeting(newGreeting);
        string memory actual = helloArchitect.getGreeting();
        assertEq(actual, newGreeting);
    }

    function testGreetingChangedEvent() public {
        string memory newGreeting = "Building on Arc!";

        // Expect the GreetingChanged event to be emitted
        vm.expectEmit(true, true, true, true);
        emit HelloArchitect.GreetingChanged(newGreeting);

        helloArchitect.setGreeting(newGreeting);
    }
}
​
3. Test the contract
Run the following command to execute the contract’s unit tests locally:
forge test
This will compile the project, run the tests defined in HelloArchitect.t.sol, and display the results in your terminal.
​
4. Compile the contract
To compile the HelloArchitect contract and generate build artifacts, run:
forge build
This creates the /out directory containing the compiled bytecode and ABI, which you’ll use when deploying the contract.
​
Deploy your contract to Arc testnet
In this step, you generate a wallet, fund it with testnet USDC (Arc’s native gas token), and deploy your smart contract to the Arc Testnet using Foundry.
​
1. Generate a wallet
To deploy the HelloArchitect contract, you need a funded wallet. Use the Foundry command-line tool to generate a new wallet:
cast wallet new
The command generates a new keypair and returns output similar to the following:
Successfully created new keypair.
Address:     0xB815A0c4bC23930119324d4359dB65e27A846A2d
Private key: 0xcc1b30a6af68ea9a9917f1dd••••••••••••••••••••••••••••••••••••••97c5
Important: Keep your private key secure. Never share it or commit it to source control.
Add your private key to your .env file:
PRIVATE_KEY="0x..."
Reload your environment variables:
source .env
​
2. Fund your wallet
Visit the Circle Faucet, select Arc Testnet, paste your wallet address, and request testnet USDC.
Since USDC is Arc’s native gas token, this will provide the funds needed to cover gas fees when deploying your contract.
Testnet USDC is for testing purposes only. It has no real-world value and must not be used in production.
​
3. Deploy the contract
With your wallet funded with testnet USDC, deploy the HelloArchitect contract to the Arc Testnet using the Foundry command-line tool:
forge create src/HelloArchitect.sol:HelloArchitect \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
Important: Never expose your real private key in production. Use environment variables or secrets management in real deployments.
After the contract is deployed successfully, you should see output similar to this:
Compiler run successful!
Deployer: 0xB815A0c4bC23930119324d4359dB65e27A846A2d
Deployed to: 0x32368037b14819C9e5Dbe96b3d67C59b8c65c4BF
Transaction hash: 0xeba0fcb5e528d586db0aeb2465a8fad0299330a9773ca62818a1827560a67346
​
4. Store the contract address
Copy the deployed contract address from the Deployed to: line and save it to your .env file:
HELLOARCHITECT_ADDRESS="0x..."
Reload your environment variables again:
source .env
​
Interact with your deployed contract
In this step, you verify that the deployment succeeded by checking the transaction in the Arc Testnet Explorer, then use cast to call a function from your contract.
​
1. Check transaction on the explorer
Open the Arc Testnet Explorer, and paste the transaction hash from the deployment output. This lets you view the transaction details and confirm that the contract was deployed successfully.
​
2. Use cast to call a contract function
Use the cast call command to interact with your deployed contract from the command line. Run the following:
cast call $HELLOARCHITECT_ADDRESS "getGreeting()(string)" \
  --rpc-url $ARC_TESTNET_RPC_URL
The command calls the getGreeting function on the HelloArchitect contract and returns the current value of the greeting variable.
​
Next steps
Congratulations, you’ve deployed and interacted with your first contract on Arc Testnet. From here, you can:
Extend the HelloArchitect contract with more logic for additional features.
Explore Arc’s stablecoin-native features like USDC as gas and deterministic finality
Build more advanced applications for payments, FX, or tokenized assets
rc MCP server

Copy page

Connect your AI coding tools to Arc documentation using the Model Context Protocol (MCP) server for search and full-page retrieval.

Documentation Index
Fetch the complete documentation index at: https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.

The Arc Model Context Protocol (MCP) server gives AI tools direct access to Arc documentation so they can search for relevant content and retrieve full pages during conversations. It is hosted at https://docs.arc.io/mcp and requires no authentication.
The server exposes two tools:
Search — finds relevant documentation snippets based on a query.
Get page — retrieves the full content of a specific documentation page.
For a machine-readable index of all documentation pages, see the llms.txt file.
​
Claude Code
Run the following command to add the Arc MCP server:
claude mcp add --transport http arc-docs https://docs.arc.io/mcp
Claude Code automatically discovers the server’s tools on the next conversation.
​
Claude Desktop
Open Settings and navigate to Connectors.
Select Add custom connector.
Enter Arc Docs as the name and https://docs.arc.io/mcp as the URL.
During a chat, use the attachments button to select the Arc Docs connector.
​
Cursor
Add the following to your mcp.json file (accessible via Cursor Settings > MCP):
{
  "mcpServers": {
    "arc-docs": {
      "url": "https://docs.arc.io/mcp"
    }
  }
}
​
VS Code (Copilot)
Create or update .vscode/mcp.json in your project root:
{
  "servers": {
    "arc-docs": {
      "type": "http",
      "url": "https://docs.arc.io/mcp"
    }
  }
}
​
Windsurf
Add the following to your Windsurf MCP configuration:
{
  "mcpServers": {
    "arc-docs": {
      "serverUrl": "https://docs.arc.io/mcp"
    }
  }
}
​
Other MCP clients
Any MCP-compatible client can connect using the HTTP transport at https://docs.arc.io/mcp. Most clients require only the server URL and transport type (http). Refer to your client’s documentation for the exact configuration format.
​
Verify the connection
After adding the server, confirm the connection by asking your AI tool a question about Arc, such as “What smart contract standards does Arc support?” The tool should return content sourced from Arc documentation. If it does not:
Check the URL — confirm it is exactly https://docs.arc.io/mcp with no trailing path.
Check network access — the server must be reachable over HTTPS from your machine.
Restart the client — some tools only detect new MCP servers after a restart or new session.
Deploy contracts

Copy page

Deploy pre-audited smart contract templates on Arc with Circle Contracts.

Documentation Index
Fetch the complete documentation index at: https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.

This tutorial guides you through deploying smart contracts on Arc Testnet with Circle Contracts. You’ll create a Circle Dev-Controlled SCA Wallet, then deploy pre-audited contract templates (ERC-20, ERC-721, ERC-1155, Airdrop). With SCA wallets, Circle Gas Station automatically sponsors your transaction fees on Arc Testnet.
These pre-audited templates represent building blocks: ERC-20 for money and liquidity, ERC-721 for identity and unique rights, ERC-1155 for scalable financial instruments, and Airdrops for distributing incentives. To learn more about available templates, visit the Templates Overview to review all templates and their options.
​
Prerequisites
To complete this tutorial, you need:
Node.js v22+ installed
Circle Developer Account - Sign up on the Developer Console
API Key - Create in the Console: Keys → Create a key → API key → Standard Key
Entity Secret - Required to initialize the Circle Dev-Controlled Wallets SDK. Learn how to register your Entity Secret
​
Step 1. Set up your project
Before deploying any template, you need a working project and a funded dev-controlled wallet on Arc Testnet. Complete the steps in this section once. Then reuse the same wallet and credentials across all template deployments below.
​
1.1. Create the project and install dependencies
Create a new directory. Navigate to it and start a new project with default settings.

Node.js

Python
mkdir hello-arc
cd hello-arc
npm init -y
npm pkg set type=module

# Add run scripts for wallet creation and contract deployment
npm pkg set scripts.create-wallet="tsx --env-file=.env create-wallet.ts"
npm pkg set scripts.deploy-erc20="tsx --env-file=.env deploy-erc20.ts"
npm pkg set scripts.deploy-erc721="tsx --env-file=.env deploy-erc721.ts"
npm pkg set scripts.deploy-erc1155="tsx --env-file=.env deploy-erc1155.ts"
npm pkg set scripts.deploy-airdrop="tsx --env-file=.env deploy-airdrop.ts"
In the project directory, install the Circle Dev-Controlled Wallets SDK and the Circle Contracts SDK. Dev-Controlled Wallets are Circle-managed wallets that your app controls via APIs. You can deploy contracts and submit transactions without managing private keys directly. You can also call the Circle Wallets API and Circle Contracts API directly if you can’t use the SDKs in your project.

Node.js

Python
npm install @circle-fin/developer-controlled-wallets @circle-fin/smart-contract-platform
npm install --save-dev tsx typescript @types/node
​
1.2. Configure TypeScript (optional)
Create a tsconfig.json file:

Node.js
npx tsc --init
Then, edit the tsconfig.json file:

Node.js
cat <<'EOF' > tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["node"]
  }
}
EOF
​
1.3. Set environment variables
Create a .env file in the project directory with your Circle credentials. Replace these placeholders with your own credentials:
.env
CIRCLE_API_KEY=YOUR_API_KEY
CIRCLE_ENTITY_SECRET=YOUR_ENTITY_SECRET
CIRCLE_WEB3_API_KEY=YOUR_API_KEY
CIRCLE_API_KEY is your Circle Developer API key for Wallets and Contracts API requests.
CIRCLE_ENTITY_SECRET is your registered entity secret used to authorize developer-controlled wallet operations.
CIRCLE_WEB3_API_KEY is the Python SDK compatibility variable and should use the same value as CIRCLE_API_KEY.
The npm run commands in this tutorial load variables from .env using Node.js native env-file support.
Prefer editing .env files in your IDE or editor so credentials are not leaked to your shell history.
This tutorial adds runtime values such as wallet IDs, transaction IDs, and contract IDs later in the flow. Keep those derived values aligned with the script outputs as you progress through the deployment steps.
​
Step 2. Set up your wallet
In this step, you create a dev-controlled wallet and fund it for contract deployment on Arc Testnet. If you already have a funded Arc Testnet dev-controlled wallet, skip to the contract templates section.
​
2.1. Create a wallet
Import the Wallets SDK and start the client with your API key and Entity Secret. Dev-controlled wallets are created in a wallet set. The wallet set is the source from which wallet keys are derived.

create-wallet.ts

create_wallet.py
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

// Create a wallet set
const walletSetResponse = await client.createWalletSet({
  name: "Wallet Set 1",
});

// Create a wallet on Arc Testnet
const walletsResponse = await client.createWallets({
  blockchains: ["ARC-TESTNET"],
  count: 1,
  walletSetId: walletSetResponse.data?.walletSet?.id ?? "",
  accountType: "SCA",
});

console.log(JSON.stringify(walletsResponse.data, null, 2));
Run the script:

Node.js

Python
npm run create-wallet
Response:
If you’re calling the API directly, you’ll need two requests. One to create the wallet set. One to create the wallet.
Be sure to replace the Entity Secret ciphertext and the idempotency key in your request. If you’re using the SDKs, this is handled for you.
You should now have a newly created dev-controlled wallet. The API response will look similar to the following:
{
  "wallets": [
    {
      "id": "45692c3e-2ffa-5c5b-a99c-61366939114c",
      "state": "LIVE",
      "walletSetId": "ee58db40-22b4-55cb-9ce6-3444cb6efd2f",
      "custodyType": "DEVELOPER",
      "address": "0xbcf83d3b112cbf43b19904e376dd8dee01fe2758",
      "blockchain": "ARC-TESTNET",
      "accountType": "SCA",
      "updateDate": "2026-01-20T09:39:16Z",
      "createDate": "2026-01-20T09:39:16Z",
      "scaCore": "circle_6900_singleowner_v3"
    }
  ]
}
Why SCA wallets? Smart Contract Accounts (SCA) on Arc Testnet work with Gas Station to automatically sponsor transaction fees. Learn more about Gas Station policies and setup.
ERC-20
ERC-721
ERC-1155
Airdrop
​
Deploy an ERC-20 contract
ERC-20 is the standard for fungible tokens. Use this template for tokenized assets, treasury instruments, governance tokens, or programmable money.
​
Step 3: Prepare for deployment
​
3.1. Get your wallet information
Retrieve your wallet ID from Step 2. Ensure:
Wallet custody type is Dev-Controlled
Blockchain is Arc Testnet
Account type is SCA (Smart Contract Account, recommended for Gas Station compatibility)
Note your wallet’s address for subsequent steps.
​
3.2. Understand deployment parameters
Parameter	Description
idempotencyKey	A unique value to prevent duplicate requests.
name	The offchain contract name (visible in Circle Console only). Use MyTokenContract.
walletId	The ID of the wallet deploying the contract. Use your dev-controlled wallet ID.
templateId	The template identifier. Use a1b74add-23e0-4712-88d1-6b3009e85a86 for ERC-20. See Templates.
blockchain	The network to deploy onto. Use ARC-TESTNET.
entitySecretCiphertext	The re-encrypted entity secret. See Entity Secret Management.
feeLevel	The fee level for transaction processing. Use MEDIUM.
templateParameters	The onchain initialization parameters (see below).
​
3.3. Template parameters
Required Parameters:
Parameter	Type	Description
name	String	The onchain contract name. Use MyToken.
defaultAdmin	String	The address with administrator permissions. Use your Dev-Controlled Wallet address.
primarySaleRecipient	String	The address that receives proceeds from first-time sales. Use your wallet address.
Optional Parameters:
Parameter	Type	Description
symbol	String	The token symbol (for example, MTK).
platformFeeRecipient	String	The address that receives platform fees from sales. Set this when implementing platform fee revenue share.
platformFeePercent	Float	The platform fee percentage as decimal (for example, 0.1 for 10%). Requires platformFeeRecipient.
contractUri	String	The URL for the contract metadata.
trustedForwarders	Strings[]	A list of addresses that can forward ERC2771 meta-transactions to this contract.
​
Step 4: Deploy the smart contract
Deploy by making a request to POST /templates/{id}/deploy:

deploy-erc20.ts

deploy_erc20.py

cURL
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";

const circleContractSdk = initiateSmartContractPlatformClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const response = await circleContractSdk.deployContractTemplate({
  id: "a1b74add-23e0-4712-88d1-6b3009e85a86",
  blockchain: "ARC-TESTNET",
  name: "MyTokenContract",
  walletId: process.env.WALLET_ID,
  templateParameters: {
    name: "MyToken",
    symbol: "MTK",
    defaultAdmin: process.env.WALLET_ADDRESS,
    primarySaleRecipient: process.env.WALLET_ADDRESS,
  },
  fee: {
    type: "level",
    config: {
      feeLevel: "MEDIUM",
    },
  },
});

console.log(JSON.stringify(response.data, null, 2));
Run the script:

Node.js

Python
npm run deploy-erc20
Response:
{
  "contractIds": ["019c053d-1ed1-772b-91a8-6970003dad8d"],
  "transactionId": "5b6185b2-f9a1-5645-9db2-ca5d9a330794"
}
A successful response indicates deployment has been initiated, not completed. Use the transactionId to check the deployment status in the next step.
​
4.1. Check deployment status
You can check the status of the deployment from the Circle Developer Console or by calling GET /transactions/{id}.
After running the deployment script, copy the transactionId from the response and update your .env file with TRANSACTION_ID={your-transaction-id}. Then run the check-transaction script to verify deployment status.

check-transaction.ts

check_transaction.py
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const circleDeveloperSdk = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const transactionResponse = await circleDeveloperSdk.getTransaction({
  id: process.env.TRANSACTION_ID!,
});

console.log(JSON.stringify(transactionResponse.data, null, 2));
Run the script:

Node.js

Python
npm pkg set scripts.check-transaction="tsx --env-file=.env check-transaction.ts"
npm run check-transaction
Transaction status may show PENDING immediately after deployment. Wait 10-30 seconds and re-run check-transaction to see COMPLETE status.
Response:
{
  "transaction": {
    "id": "601a0815-f749-41d8-b193-22cadd2a8977",
    "blockchain": "ARC-TESTNET",
    "walletId": "45692c3e-2ffa-5c5b-a99c-61366939114c",
    "sourceAddress": "0xbcf83d3b112cbf43b19904e376dd8dee01fe2758",
    "contractAddress": "0x281156899e5bd6fecf1c0831ee24894eeeaea2f8",
    "transactionType": "OUTBOUND",
    "custodyType": "DEVELOPER",
    "state": "COMPLETE",
    "amounts": [],
    "nfts": null,
    "txHash": "0x3bfbab5d5ce0d1a5d682cbc742d3940cf59db0369d173b71ba2a3b8f43bfbcb1",
    "blockHash": "0x7d12148f9331556b31f84f58a41b7ff16eaaa47940f9e86733037d7ab74d858e",
    "blockHeight": 23686153,
    "userOpHash": "0x66befac1a371fcdddf1566215e4677127e111dff9253f306f7096fed8642a208",
    "networkFee": "0.044628774800664",
    "firstConfirmDate": "2026-01-26T08:59:56Z",
    "operation": "CONTRACT_EXECUTION",
    "feeLevel": "MEDIUM",
    "estimatedFee": {
      "gasLimit": "500797",
      "networkFee": "0.16506442157883425",
      "baseFee": "160",
      "priorityFee": "9.60345525",
      "maxFee": "329.60345525"
    },
    "refId": "",
    "abiFunctionSignature": "mintTo(address,uint256)",
    "abiParameters": [
      "0xbcf83d3b112cbf43b19904e376dd8dee01fe2758",
      "1000000000000000000"
    ],
    "createDate": "2026-01-26T08:59:54Z",
    "updateDate": "2026-01-26T08:59:56Z"
  }
}
​
4.2. Get the contract address
After deployment completes, retrieve the contract address using GET /contracts/{id}.
After deployment completes, copy the contractIds[0] from the deployment response and update your .env file with CONTRACT_ID={your-contract-id}. Then run the get-contract script to retrieve the contract address.

get-contract.ts

get_contract.py
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";

const circleContractSdk = initiateSmartContractPlatformClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const contractResponse = await circleContractSdk.getContract({
  id: process.env.CONTRACT_ID!,
});

console.log(JSON.stringify(contractResponse.data, null, 2));
Run the script:

Node.js

Python
npm pkg set scripts.get-contract="tsx --env-file=.env get-contract.ts"
npm run get-contract
Response:
{
  "contract": {
    "id": "b7c35372-ce69-4ccd-bfaa-504c14634f0d",
    "contractAddress": "0x1234567890abcdef1234567890abcdef12345678",
    "blockchain": "ARC-TESTNET",
    "status": "COMPLETE"
  }
}
Once your contract is deployed, you can interact with it from your application. You’ll be able to view the contract both in the Circle Developer Console and on the Arc Testnet Explorer.
Initial Supply: The contract starts with 0 token supply at deployment. Use the mintTo function to create tokens and assign them to addresses as needed.
​
Summary
After completing this tutorial, you’ve successfully:
Created a dev-controlled wallet on Arc Testnet
Funded your wallet with testnet USDC
Deployed a smart contract using Contract Templates
Retrieved your contract addressInteract with contracts

Copy page

Execute contract functions on Arc Testnet to mint tokens, transfer assets, and perform contract operations.

Documentation Index
Fetch the complete documentation index at: https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.

This tutorial guides you through interacting with smart contracts deployed on Arc Testnet. You’ll learn how to execute contract functions like minting tokens, transferring assets, and performing contract-specific operations for ERC-20, ERC-721, ERC-1155, and Airdrop contracts.
​
Prerequisites
Complete the Deploy contracts tutorial first. You’ll need a deployed contract.
​
Step 1. Update your project
In this step, you update the project you created in the Deploy contracts tutorial with the additional environment variable and npm scripts needed for contract interactions.
​
1.1. Set environment variables
Add this new variable to your existing .env file (from the Deploy contracts tutorial):
.env
RECIPIENT_WALLET_ADDRESS=YOUR_RECIPIENT_ADDRESS
RECIPIENT_WALLET_ADDRESS is the wallet address that receives transferred tokens during the interaction examples.
Your .env file should already have CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, WALLET_ID, WALLET_ADDRESS, and CONTRACT_ADDRESS from the Deploy contracts tutorial. You’re only adding 1 new variable here.
The npm run commands in this tutorial load variables from .env using Node.js native env-file support.
Prefer editing .env files in your IDE or editor so credentials are not leaked to your shell history.
​
1.2. Add npm scripts
Add run scripts for contract interactions to your package.json:
npm pkg set scripts.interact-erc20="tsx --env-file=.env interact-erc20.ts"
npm pkg set scripts.interact-erc721="tsx --env-file=.env interact-erc721.ts"
npm pkg set scripts.interact-erc1155="tsx --env-file=.env interact-erc1155.ts"
npm pkg set scripts.interact-airdrop="tsx --env-file=.env interact-airdrop.ts"
​
Step 2. Interact with contracts
Select the contract type you want to interact with from the tabs below.
ERC-20
ERC-721
ERC-1155
Airdrop
​
Interact with ERC-20 contracts
ERC-20 tokens support standard fungible token operations. You’ll learn to mint new tokens and transfer them between addresses.
​
Mint tokens
Use the mintTo function to mint tokens. The wallet must have MINTER_ROLE.

Node.js

Python

cURL
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const circleDeveloperSdk = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const mintResponse =
  await circleDeveloperSdk.createContractExecutionTransaction({
    walletId: process.env.WALLET_ID,
    abiFunctionSignature: "mintTo(address,uint256)",
    abiParameters: [
      process.env.WALLET_ADDRESS,
      "1000000000000000000", // 1 token with 18 decimals
    ],
    contractAddress: process.env.CONTRACT_ADDRESS,
    fee: {
      type: "level",
      config: {
        feeLevel: "MEDIUM",
      },
    },
  });

console.log(JSON.stringify(mintResponse.data, null, 2));
Response:
{
  "id": "601a0815-f749-41d8-b193-22cadd2a8977",
  "state": "INITIATED"
}
Token decimals: ERC-20 tokens typically use 18 decimals. To mint 1 token, use 1000000000000000000 (1 × 10^18).
​
Transfer tokens
Use the transfer function to send tokens to another address.

Node.js

Python

cURL
const transferResponse =
  await circleDeveloperSdk.createContractExecutionTransaction({
    walletId: process.env.WALLET_ID,
    abiFunctionSignature: "transfer(address,uint256)",
    abiParameters: [
      process.env.RECIPIENT_WALLET_ADDRESS,
      "1000000000000000000", // 1 token with 18 decimals
    ],
    contractAddress: process.env.CONTRACT_ADDRESS,
    fee: {
      type: "level",
      config: {
        feeLevel: "MEDIUM",
      },
    },
  });

console.log(JSON.stringify(transferResponse.data, null, 2));
Response:
{
  "id": "601a0815-f749-41d8-b193-22cadd2a8977",
  "state": "INITIATED"
}
​
Full ERC-20 interaction script
Here’s the full script combining mint and transfer operations:

interact-erc20.ts

interact_erc20.py
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const circleDeveloperSdk = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

async function main() {
  // Mint tokens
  const mintResponse =
    await circleDeveloperSdk.createContractExecutionTransaction({
      walletId: process.env.WALLET_ID,
      abiFunctionSignature: "mintTo(address,uint256)",
      abiParameters: [
        process.env.WALLET_ADDRESS,
        "1000000000000000000", // 1 token with 18 decimals
      ],
      contractAddress: process.env.CONTRACT_ADDRESS,
      fee: {
        type: "level",
        config: {
          feeLevel: "MEDIUM",
        },
      },
    });

  console.log(JSON.stringify(mintResponse.data, null, 2));

  // Transfer tokens
  const transferResponse =
    await circleDeveloperSdk.createContractExecutionTransaction({
      walletId: process.env.WALLET_ID,
      abiFunctionSignature: "transfer(address,uint256)",
      abiParameters: [
        process.env.RECIPIENT_WALLET_ADDRESS,
        "1000000000000000000", // 1 token with 18 decimals
      ],
      contractAddress: process.env.CONTRACT_ADDRESS,
      fee: {
        type: "level",
        config: {
          feeLevel: "MEDIUM",
        },
      },
    });

  console.log(JSON.stringify(transferResponse.data, null, 2));
}

main();
Run the script:

Node.js

Python
npm run interact-erc20
​
Summary
After completing this tutorial, you’ve learned how to:
Execute contract functions using the Circle SDKs
Mint and transfer tokens for your deployed contracts
Perform contract-specific operations based on token type
Monitor contract events

Copy page

Track onchain activity by monitoring contract events.

Documentation Index
Fetch the complete documentation index at: https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.

Track contract events and get event logs with the Circle Contracts API.
​
Prerequisites
You need a deployed contract to monitor. If you completed the Deploy contracts tutorial, you can continue with that contract. If your contract was deployed elsewhere, import it in Step 3.
​
Step 1. Update your project
If you haven’t already, add run scripts for monitoring contract events to your package.json:
npm pkg set scripts.webhook="tsx webhook-receiver.ts"
npm pkg set scripts.import-contract="tsx --env-file=.env import-contract.ts"
npm pkg set scripts.create-monitor="tsx --env-file=.env create-monitor.ts"
npm pkg set scripts.get-event-logs="tsx --env-file=.env get-event-logs.ts"
If you completed the Deploy contracts tutorial, your project already has the required SDKs installed. The npm scripts previously listed work with your existing setup.
​
Step 2. Set up your webhook
Event monitors send real-time updates to your webhook endpoint when events happen.
webhook.site
ngrok
Visit webhook.site
Copy your unique webhook URL (for example, https://webhook.site/your-uuid)
​
Step 3. Register your webhook in Console
Register your webhook URL in the Developer Console:
Go to Developer Console
Navigate to Webhooks (left sidebar)
Click Add a webhook
Enter your webhook URL (from Step 1) and create the webhook
Register your webhook before creating event monitors. This allows Circle to send notifications to your endpoint.
​
Step 4. Import a contract (optional)
If your contract was deployed elsewhere and is not yet available in the Developer Console, import it first. If you deployed a contract using Circle Contracts, including the Deploy contracts tutorial, skip this step. Your contract is already available in the Console.

import-contract.ts

import_contract.py
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";

const contractClient = initiateSmartContractPlatformClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

async function importContract() {
  try {
    const response = await contractClient.importContract({
      blockchain: "ARC-TESTNET",
      address: process.env.CONTRACT_ADDRESS,
      name: "MyContract",
    });

    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error("Error importing contract:", error.message);
    throw error;
  }
}

importContract();
Run the script:

Node.js

Python
npm run import-contract
If the contract is already imported, you’ll see an error: contract already exists. This means the contract is already available in the Console and you can proceed to create an event monitor.
​
Step 5. Create an event monitor
Event monitors track specific contract events. They send updates to your webhook endpoint. This example monitors Transfer events:

create-monitor.ts

create_monitor.py
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";

const contractClient = initiateSmartContractPlatformClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

async function createEventMonitor() {
  try {
    const response = await contractClient.createEventMonitor({
      blockchain: "ARC-TESTNET",
      contractAddress: process.env.CONTRACT_ADDRESS,
      eventSignature: "Transfer(address,address,uint256)",
    });

    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error("Error creating event monitor:", error.message);
    throw error;
  }
}

createEventMonitor();
Run the script:

Node.js

Python
npm run create-monitor
Response:
{
  "eventMonitor": {
    "id": "019bf984-b4da-7026-a3d2-674ce371a933",
    "contractName": "TestERC20Token",
    "contractId": "019bf8be-7be5-7a3e-89cc-05bcd7413f20",
    "contractAddress": "0x281156899e5bd6fecf1c0831ee24894eeeaea2f8",
    "blockchain": "ARC-TESTNET",
    "eventSignature": "Transfer(address,address,uint256)",
    "eventSignatureHash": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    "isEnabled": true,
    "createDate": "2026-01-26T08:56:22.490638Z",
    "updateDate": "2026-01-26T08:56:22.490638Z"
  }
}
​
Step 6. Receive webhook notifications
When events occur, Circle sends updates to your endpoint. Here is what a Transfer event looks like:
{
  "subscriptionId": "f0332621-a117-4b7b-bdf0-5c61a4681826",
  "notificationId": "5c5eea9f-398f-426f-a4a5-1bdc28b36d2c",
  "notificationType": "contracts.eventLog",
  "notification": {
    "contractAddress": "0x4abcffb90897fe7ce86ed689d1178076544a021b",
    "blockchain": "ARC-TESTNET",
    "txHash": "0xe15d6dbb50178f60930b8a3e3e775f3c022505ea2e351b6c2c2985d2405c8ebc",
    "userOpHash": "0x78c3e8185ff9abfc7197a8432d9b79566123616c136001e609102c97e732e55e",
    "blockHash": "0x0ad6bf57a110d42620defbcb9af98d6223f060de588ed96ae495ddeaf3565c8d",
    "blockHeight": 22807198,
    "eventSignature": "Transfer(address,address,uint256)",
    "eventSignatureHash": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    "topics": [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x000000000000000000000000bcf83d3b112cbf43b19904e376dd8dee01fe2758"
    ],
    "data": "0x0000000000000000000000000000000000000000000000000de0b6b3a7640000",
    "firstConfirmDate": "2026-01-21T06:53:12Z"
  },
  "timestamp": "2026-01-21T06:53:13.194467201Z",
  "version": 2
}
Key fields:
notificationType: Always "contracts.eventLog" for event monitor webhooks
notification.eventSignature: The event that was emitted
notification.contractAddress: Address of the contract that emitted the event
notification.blockchain: The blockchain network (for example, ARC-TESTNET)
notification.txHash: Transaction hash where the event occurred
notification.userOpHash: User operation hash (for smart contract accounts)
notification.blockHash: Hash of the block containing the transaction
notification.blockHeight: Block number where the event occurred
notification.eventSignatureHash: Keccak256 hash of the event signature
notification.topics: Indexed event parameters (for example, from and to addresses)
notification.data: Non-indexed event parameters (for example, token amount)
notification.firstConfirmDate: Timestamp when the event was first confirmed
timestamp: Timestamp when the webhook was sent
version: Webhook payload version
You can verify webhook delivery status in the Developer Console under Contracts → Monitoring.
​
Step 7. Retrieve event logs
You can also query event logs with the API. This is useful for past events or if you prefer polling.
Webhooks vs Polling: Webhooks send real-time updates (push). Polling needs periodic API calls (pull). Use webhooks for production and polling for testing or past queries.

get-event-logs.ts

get_event_logs.py
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";

const contractClient = initiateSmartContractPlatformClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

async function getEventLogs() {
  try {
    const response = await contractClient.listEventLogs({
      contractAddress: process.env.CONTRACT_ADDRESS,
      blockchain: "ARC-TESTNET",
      pageSize: 10,
    });

    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error("Error fetching event logs:", error.message);
    throw error;
  }
}

getEventLogs();
Run the script:

Node.js

Python
npm run get-event-logs
Replace CONTRACT_ADDRESS with your contract address. You can get this address when you deploy the contract, or by listing your contracts with listContracts().
Response:
{
  "eventLogs": [
    {
      "id": "019bf987-f901-7145-9e95-55f177b05b24",
      "subscriptionId": "019bf984-b4da-7026-a3d2-674ce371a933",
      "contractId": "019bf8be-7be5-7a3e-89cc-05bcd7413f20",
      "contractName": "TestERC20Token",
      "blockchain": "ARC-TESTNET",
      "txHash": "0x3bfbab5d5ce0d1a5d682cbc742d3940cf59db0369d173b71ba2a3b8f43bfbcb1",
      "logIndex": "50",
      "blockHash": "0x7d12148f9331556b31f84f58a41b7ff16eaaa47940f9e86733037d7ab74d858e",
      "blockHeight": 23686153,
      "contractAddress": "0x281156899e5bd6fecf1c0831ee24894eeeaea2f8",
      "eventSignature": "Transfer(address,address,uint256)",
      "eventSignatureHash": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      "topics": [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x000000000000000000000000bcf83d3b112cbf43b19904e376dd8dee01fe2758"
      ],
      "data": "0x0000000000000000000000000000000000000000000000000de0b6b3a7640000",
      "decodedTopics": null,
      "decodedData": null,
      "userOpHash": "0x66befac1a371fcdddf1566215e4677127e111dff9253f306f7096fed8642a208",
      "firstConfirmDate": "2026-01-26T08:59:55Z",
      "createDate": "2026-01-26T08:59:56.545962Z",
      "updateDate": "2026-01-26T08:59:56.545962Z"
    }
  ]
}
You can view, update, and delete event monitors with the Circle Contracts API. See the API Reference for details on managing your monitors.
​
Summary
After completing this tutorial, you’ve successfully:
Set up webhook endpoints using webhook.site or ngrok
Registered webhooks in the Developer Console
Created event monitors for specific contract events
Received real-time webhook updates for contract events
Retrieved past event logs with the Circle SDK
Register your first AI agent

Copy page

Register AI agents with onchain identity, build reputation, and verify credentials using ERC-8004 on Arc Testnet.

Documentation Index
Fetch the complete documentation index at: https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.

This quickstart guides you through registering an AI agent using the ERC-8004 standard on Arc Testnet. You’ll create developer-controlled wallets, register your agent’s identity, record reputation events, and verify credentials. Select the tab that matches your preferred setup.
​
ERC-8004 contracts on Arc testnet
Contract	Address
IdentityRegistry	0x8004A818BFB912233c491871b3d84c89A494BD9e
ReputationRegistry	0x8004B663056A597Dffe9eCcC1965A193B7388713
ValidationRegistry	0x8004Cb1BF31DAf7788923b405b754f57acEB4272
Circle Wallets
Viem
​
Prerequisites
Before you begin, make sure you have:
A Circle Developer Console account
An API key created in the Console: Keys → Create a key → API key → Standard Key
Your Entity Secret registered
​
Step 1. Set up your project
Create a project directory, install dependencies, and configure your environment.
​
1.1. Create the project and install dependencies

Node.js

Python
mkdir erc8004-quickstart
cd erc8004-quickstart
npm init -y
npm pkg set type=module
npm pkg set scripts.start="tsx --env-file=.env index.ts"

npm install @circle-fin/developer-controlled-wallets viem
npm install --save-dev tsx typescript @types/node
​
1.2. Configure TypeScript (optional)
This step is optional. It helps prevent missing types in your IDE or editor.
Create a tsconfig.json file:
npx tsc --init
Then, update the tsconfig.json file:
cat <<'EOF' > tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["node"]
  }
}
EOF
​
1.3. Set environment variables
Create a .env file in the project directory and add your Circle credentials:
CIRCLE_API_KEY=YOUR_API_KEY
CIRCLE_ENTITY_SECRET=YOUR_ENTITY_SECRET
Where YOUR_API_KEY is your Circle Developer API key and YOUR_ENTITY_SECRET is your registered Entity Secret.
The npm run start command loads these variables from .env using Node.js native env-file support.
Prefer editing .env files in your IDE or editor so credentials are not leaked to your shell history.
​
Step 2. Create developer-controlled wallets
In this step, you create two Arc Testnet dev-controlled wallets for the ERC-8004 flow. One wallet owns the agent and the other records reputation. If you already have two Arc Testnet dev-controlled wallets for this flow, skip to Step 3. Per ERC-8004, agent owners cannot record reputation for their own agents to prevent self-dealing.
The Step 2 through 7 code snippets explain the flow in smaller pieces. They are not cumulative and will not run if pasted together. To run the full workflow end to end, use the complete script at the end of this tutorial.

index.ts

index.py
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const walletSet = await circleClient.createWalletSet({
  name: "ERC8004 Agent Wallets",
});

const walletsResponse = await circleClient.createWallets({
  blockchains: ["ARC-TESTNET"],
  count: 2,
  walletSetId: walletSet.data?.walletSet?.id ?? "",
  accountType: "SCA",
});

const ownerWallet = walletsResponse.data?.wallets?.[0]!;
const validatorWallet = walletsResponse.data?.wallets?.[1]!;

console.log(`Owner:     ${ownerWallet.address}`);
console.log(`Validator: ${validatorWallet.address}`);
​
Step 3. Prepare agent metadata
Create a JSON file with metadata for your agent. The structure below is an example you can adapt for your use case. ERC-8004 registration stores a metadata URI, but the JSON fields at that URI are application-defined unless your integration follows a separate metadata convention.
agent-metadata.json
{
  "name": "DeFi Arbitrage Agent v1.0",
  "description": "Autonomous trading agent for cross-DEX arbitrage on Arc",
  "image": "ipfs://QmAgentAvatarHash...",
  "agent_type": "trading",
  "capabilities": [
    "arbitrage_detection",
    "liquidity_monitoring",
    "automated_execution"
  ],
  "version": "1.0.0"
}
Upload to IPFS using Pinata, NFT.Storage, Web3.Storage or your preferred IPFS tool. You’ll receive an IPFS URI like ipfs://QmYourHash....
For this quickstart, you can skip uploading and use the example URI: ipfs://bafkreibdi6623n3xpf7ymk62ckb4bo75o3qemwkpfvp5i25j66itxvsoei
​
Step 4. Register your agent identity
Call register(metadataURI) on the IdentityRegistry to mint an identity NFT for your agent.

index.ts

index.py
const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";

const METADATA_URI =
  process.env.METADATA_URI ||
  "ipfs://bafkreibdi6623n3xpf7ymk62ckb4bo75o3qemwkpfvp5i25j66itxvsoei";

const registerTx = await circleClient.createContractExecutionTransaction({
  walletAddress: ownerWallet.address!,
  blockchain: "ARC-TESTNET",
  contractAddress: IDENTITY_REGISTRY,
  abiFunctionSignature: "register(string)",
  abiParameters: [METADATA_URI],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});

// Poll until confirmed
let txHash: string | undefined;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const { data } = await circleClient.getTransaction({
    id: registerTx.data?.id!,
  });
  if (data?.transaction?.state === "COMPLETE") {
    txHash = data.transaction.txHash;
    break;
  }
  if (data?.transaction?.state === "FAILED")
    throw new Error("Registration failed");
}

console.log(`Registered: https://testnet.arcscan.app/tx/${txHash}`);
With Circle Gas Station, your application sponsors the transaction fees. On Arc, gas is approximately 0.006 USDC-TESTNET per transaction.
​
Step 5. Retrieve your agent ID
Query the Transfer event from the IdentityRegistry to find the token ID minted for your agent.

index.ts

index.py
import { createPublicClient, http, parseAbiItem, getContract } from "viem";
import { arcTestnet } from "viem/chains";

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

const latestBlock = await publicClient.getBlockNumber();
const blockRange = 10000n; // RPC limit: eth_getLogs is often capped at 10,000 blocks
const fromBlock = latestBlock > blockRange ? latestBlock - blockRange : 0n;

const transferLogs = await publicClient.getLogs({
  address: IDENTITY_REGISTRY,
  event: parseAbiItem(
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ),
  args: { to: ownerWallet.address as `0x${string}` },
  fromBlock,
  toBlock: latestBlock,
});

if (transferLogs.length === 0) {
  throw new Error("No Transfer events found — registration may have failed");
}

const agentId = transferLogs[transferLogs.length - 1].args.tokenId!.toString();

const identityContract = getContract({
  address: IDENTITY_REGISTRY,
  abi: [
    {
      name: "ownerOf",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "tokenId", type: "uint256" }],
      outputs: [{ name: "", type: "address" }],
    },
    {
      name: "tokenURI",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "tokenId", type: "uint256" }],
      outputs: [{ name: "", type: "string" }],
    },
  ],
  client: publicClient,
});

const owner = await identityContract.read.ownerOf([BigInt(agentId)]);
const tokenURI = await identityContract.read.tokenURI([BigInt(agentId)]);

console.log(`Agent ID: ${agentId}`);
console.log(`Owner: ${owner}`);
console.log(`Metadata: ${tokenURI}`);
Your AI agent now has a unique onchain identity.
​
Step 6. Record reputation
Build your agent’s reputation by recording feedback. Use the validator wallet — per ERC-8004, agent owners cannot record reputation for their own agents.

index.ts

index.py
import { keccak256, toHex } from "viem";

const REPUTATION_REGISTRY = "0x8004B663056A597Dffe9eCcC1965A193B7388713";

const tag = "successful_trade";
const feedbackHash = keccak256(toHex(tag));

const reputationTx = await circleClient.createContractExecutionTransaction({
  walletAddress: validatorWallet.address!,
  blockchain: "ARC-TESTNET",
  contractAddress: REPUTATION_REGISTRY,
  abiFunctionSignature:
    "giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)",
  abiParameters: [agentId, "95", "0", tag, "", "", "", feedbackHash],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});

// Poll until confirmed (same pattern as Step 4)
Production scoring: This quickstart hardcodes score: 95 for demonstration. In production, calculate scores dynamically based on agent behavior. For example, score = loanRepaidOnTime ? 100 : 20 for lending protocols, or score = slippagePct < 1 ? 95 : 60 for trading platforms.
The ReputationRegistry stores attestations from external observers who witnessed the agent’s actions. Your application logic calculates scores based on outcomes, then records them onchain.
​
Step 7. Request and verify validation
The ERC-8004 ValidationRegistry uses a two-step request/response flow. The agent owner requests validation from a validator, then the validator submits a response.

index.ts

index.py
const VALIDATION_REGISTRY = "0x8004Cb1BF31DAf7788923b405b754f57acEB4272";

const requestURI = "ipfs://bafkreiexamplevalidationrequest";
const requestHash = keccak256(
  toHex(`kyc_verification_request_agent_${agentId}`),
);

// Owner requests validation
const validationReqTx = await circleClient.createContractExecutionTransaction({
  walletAddress: ownerWallet.address!,
  blockchain: "ARC-TESTNET",
  contractAddress: VALIDATION_REGISTRY,
  abiFunctionSignature: "validationRequest(address,uint256,string,bytes32)",
  abiParameters: [validatorWallet.address!, agentId, requestURI, requestHash],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});

// Poll until confirmed (same pattern as Step 4)

// Validator responds (100 = passed, 0 = failed)
const validationResTx = await circleClient.createContractExecutionTransaction({
  walletAddress: validatorWallet.address!,
  blockchain: "ARC-TESTNET",
  contractAddress: VALIDATION_REGISTRY,
  abiFunctionSignature:
    "validationResponse(bytes32,uint8,string,bytes32,string)",
  abiParameters: [
    requestHash,
    "100",
    "",
    "0x" + "0".repeat(64),
    "kyc_verified",
  ],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});

// Poll until confirmed, then verify:
const validationContract = getContract({
  address: VALIDATION_REGISTRY,
  abi: [
    {
      name: "getValidationStatus",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "requestHash", type: "bytes32" }],
      outputs: [
        { name: "validatorAddress", type: "address" },
        { name: "agentId", type: "uint256" },
        { name: "response", type: "uint8" },
        { name: "responseHash", type: "bytes32" },
        { name: "tag", type: "string" },
        { name: "lastUpdate", type: "uint256" },
      ],
    },
  ],
  client: publicClient,
});

type ValidationStatus = readonly [
  `0x${string}`,
  bigint,
  number,
  `0x${string}`,
  string,
  bigint,
];

const [valAddr, , response, , tag] =
  (await validationContract.read.getValidationStatus([
    requestHash,
  ])) as ValidationStatus;

console.log(`Validator: ${valAddr}`);
console.log(`Response: ${response} (100 = passed)`);
console.log(`Tag: ${tag}`);
​
Full agent registration script
The complete script below combines all the preceding steps into a single runnable file.

index.ts

index.py
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import {
  createPublicClient,
  http,
  parseAbiItem,
  getContract,
  keccak256,
  toHex,
} from "viem";
import { arcTestnet } from "viem/chains";

const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const REPUTATION_REGISTRY = "0x8004B663056A597Dffe9eCcC1965A193B7388713";
const VALIDATION_REGISTRY = "0x8004Cb1BF31DAf7788923b405b754f57acEB4272";

const METADATA_URI =
  process.env.METADATA_URI ||
  "ipfs://bafkreibdi6623n3xpf7ymk62ckb4bo75o3qemwkpfvp5i25j66itxvsoei";

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

// Helper functions
async function waitForTransaction(txId: string, label: string) {
  process.stdout.write(`  Waiting for ${label}`);
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data } = await circleClient.getTransaction({ id: txId });
    if (data?.transaction?.state === "COMPLETE") {
      const txHash = data.transaction.txHash;
      console.log(` ✓\n  Tx: https://testnet.arcscan.app/tx/${txHash}`);
      return txHash;
    }
    if (data?.transaction?.state === "FAILED") {
      throw new Error(`${label} failed onchain`);
    }
    process.stdout.write(".");
  }
  throw new Error(`${label} timed out`);
}

// Main invocation
async function main() {
  console.log("\n── Step 1: Create wallets ──");

  const walletSet = await circleClient.createWalletSet({
    name: "ERC8004 Agent Wallets",
  });

  const walletsResponse = await circleClient.createWallets({
    blockchains: ["ARC-TESTNET"],
    count: 2,
    walletSetId: walletSet.data?.walletSet?.id ?? "",
    accountType: "SCA",
  });

  const ownerWallet = walletsResponse.data?.wallets?.[0]!;
  const validatorWallet = walletsResponse.data?.wallets?.[1]!;

  console.log(`  Owner:     ${ownerWallet.address} (${ownerWallet.id})`);
  console.log(
    `  Validator: ${validatorWallet.address} (${validatorWallet.id})`,
  );

  console.log("\n── Step 2: Register agent identity ──");
  console.log(`  Metadata URI: ${METADATA_URI}`);

  const registerTx = await circleClient.createContractExecutionTransaction({
    walletAddress: ownerWallet.address!,
    blockchain: "ARC-TESTNET",
    contractAddress: IDENTITY_REGISTRY,
    abiFunctionSignature: "register(string)",
    abiParameters: [METADATA_URI],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  await waitForTransaction(registerTx.data?.id!, "registration");

  console.log("\n── Step 3: Retrieve agent ID ──");

  const latestBlock = await publicClient.getBlockNumber();
  const blockRange = 10000n; // RPC limit: eth_getLogs is often capped at 10,000 blocks
  const fromBlock = latestBlock > blockRange ? latestBlock - blockRange : 0n;

  const transferLogs = await publicClient.getLogs({
    address: IDENTITY_REGISTRY,
    event: parseAbiItem(
      "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    ),
    args: { to: ownerWallet.address as `0x${string}` },
    fromBlock,
    toBlock: latestBlock,
  });

  if (transferLogs.length === 0) {
    throw new Error("No Transfer events found — registration may have failed");
  }

  const agentId =
    transferLogs[transferLogs.length - 1].args.tokenId!.toString();

  const identityContract = getContract({
    address: IDENTITY_REGISTRY,
    abi: [
      {
        name: "ownerOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ name: "", type: "address" }],
      },
      {
        name: "tokenURI",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ name: "", type: "string" }],
      },
    ],
    client: publicClient,
  });

  const owner = await identityContract.read.ownerOf([BigInt(agentId)]);
  const tokenURI = await identityContract.read.tokenURI([BigInt(agentId)]);

  console.log(`  Agent ID:     ${agentId}`);
  console.log(`  Owner:        ${owner}`);
  console.log(`  Metadata URI: ${tokenURI}`);

  console.log("\n── Step 4: Record reputation ──");

  const tag = "successful_trade";
  const feedbackHash = keccak256(toHex(tag));

  const reputationTx = await circleClient.createContractExecutionTransaction({
    walletAddress: validatorWallet.address!,
    blockchain: "ARC-TESTNET",
    contractAddress: REPUTATION_REGISTRY,
    abiFunctionSignature:
      "giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)",
    abiParameters: [agentId, "95", "0", tag, "", "", "", feedbackHash],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  await waitForTransaction(reputationTx.data?.id!, "reputation");

  console.log("\n── Step 5: Verify reputation ──");

  const reputationLogs = await publicClient.getLogs({
    address: REPUTATION_REGISTRY,
    fromBlock: latestBlock - 1000n,
    toBlock: "latest",
  });

  console.log(`  Found ${reputationLogs.length} feedback event(s)`);

  // Owner requests; validator responds per ERC-8004
  console.log("\n── Step 6: Request validation ──");

  const requestURI = "ipfs://bafkreiexamplevalidationrequest";
  const requestHash = keccak256(
    toHex(`kyc_verification_request_agent_${agentId}`),
  );

  const validationReqTx = await circleClient.createContractExecutionTransaction(
    {
      walletAddress: ownerWallet.address!,
      blockchain: "ARC-TESTNET",
      contractAddress: VALIDATION_REGISTRY,
      abiFunctionSignature: "validationRequest(address,uint256,string,bytes32)",
      abiParameters: [
        validatorWallet.address!,
        agentId,
        requestURI,
        requestHash,
      ],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    },
  );

  await waitForTransaction(validationReqTx.data?.id!, "validation request");

  // Validator responds; 100 = passed, 0 = failed
  console.log("\n── Step 7: Validation response ──");

  const validationResTx = await circleClient.createContractExecutionTransaction(
    {
      walletAddress: validatorWallet.address!,
      blockchain: "ARC-TESTNET",
      contractAddress: VALIDATION_REGISTRY,
      abiFunctionSignature:
        "validationResponse(bytes32,uint8,string,bytes32,string)",
      abiParameters: [
        requestHash,
        "100",
        "",
        "0x" + "0".repeat(64),
        "kyc_verified",
      ],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    },
  );

  await waitForTransaction(validationResTx.data?.id!, "validation response");

  console.log("\n── Step 8: Check validation ──");

  const validationContract = getContract({
    address: VALIDATION_REGISTRY,
    abi: [
      {
        name: "getValidationStatus",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "requestHash", type: "bytes32" }],
        outputs: [
          { name: "validatorAddress", type: "address" },
          { name: "agentId", type: "uint256" },
          { name: "response", type: "uint8" },
          { name: "responseHash", type: "bytes32" },
          { name: "tag", type: "string" },
          { name: "lastUpdate", type: "uint256" },
        ],
      },
    ],
    client: publicClient,
  });

  type ValidationStatus = readonly [
    `0x${string}`,
    bigint,
    number,
    `0x${string}`,
    string,
    bigint,
  ];

  const [valAddr, , valResponse, , valTag] =
    (await validationContract.read.getValidationStatus([
      requestHash,
    ])) as ValidationStatus;

  console.log(`  Validator:  ${valAddr}`);
  console.log(`  Response:   ${valResponse} (100 = passed)`);
  console.log(`  Tag:        ${valTag}`);

  console.log("\n── Complete ──");
  console.log("  ✓ Identity registered");
  console.log("  ✓ Reputation recorded");
  console.log("  ✓ Validation requested and verified");
  console.log(
    `\n  Explorer: https://testnet.arcscan.app/address/${ownerWallet.address}\n`,
  );
}

main().catch((error) => {
  console.error("\nError:", error.message ?? error);
  process.exit(1);
});
See all 266 lines
Save it, then run:

Node.js

Python
npm run start
If you followed the Python workflow, run deactivate when you’re done to exit the virtual environment.
​
Summary
After completing this quickstart, you’ve successfully:
Created or prepared two Arc Testnet wallets for the ERC-8004 flow
Registered an AI agent with a unique onchain identity (ERC-721 token)
Recorded reputation feedback from an external validator
Requested validation from a validator and verified the response onchain
Create your first ERC-8183 job

Copy page

Create an ERC-8183 job, fund escrow with USDC, submit a deliverable hash, and complete settlement on Arc Testnet.

Documentation Index
Fetch the complete documentation index at: https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.

This quickstart guides you through the ERC-8183 job lifecycle on Arc Testnet. You’ll create developer-controlled smart contract account wallets, create a job, fund escrow with USDC, submit a deliverable hash, and complete the job as the evaluator. Select the tab that matches your preferred setup.
​
ERC-8183 contract on Arc testnet
Contract	Address
AgenticCommerce reference implementation	0x0747EEf0706327138c69792bF28Cd525089e4583
Circle Wallets
Viem
​
Prerequisites
Before you begin, make sure you have:
A Circle Developer Console account
An API key created in the Console: Keys → Create a key → API key → Standard Key
Your Entity Secret registered
​
Step 1. Set up your project
Create a project directory, install dependencies, and configure your environment.
​
1.1. Create the project and install dependencies

Node.js

Python
mkdir erc8183-quickstart
cd erc8183-quickstart
npm init -y
npm pkg set type=module
npm pkg set scripts.start="tsx --env-file=.env index.ts"

npm install @circle-fin/developer-controlled-wallets viem
npm install --save-dev tsx typescript @types/node
​
1.2. Configure TypeScript (optional)
This step is optional. It helps prevent missing types in your IDE or editor.
Create a tsconfig.json file:
npx tsc --init
Then, update the tsconfig.json file:
cat <<'EOF' > tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["node"]
  }
}
EOF
​
1.3. Set environment variables
Create a .env file in the project directory and add your Circle credentials:
CIRCLE_API_KEY=YOUR_API_KEY
CIRCLE_ENTITY_SECRET=YOUR_ENTITY_SECRET
CIRCLE_API_KEY is your Circle Developer API key.
CIRCLE_ENTITY_SECRET is your registered Entity Secret.
The npm run start command loads variables from .env using Node.js native env-file support. The python index.py command loads the same .env file via python-dotenv.
Prefer editing .env files in your IDE or editor so credentials are not leaked to your shell history.
​
Step 2. Create developer-controlled wallets
In this step, you create two Arc Testnet dev-controlled wallets for the ERC-8183 flow: a client wallet and a provider wallet. In this quickstart, the client also acts as the evaluator. If you already have two Arc Testnet funded dev-controlled wallets for this flow, skip to Step 4.
The Step 2 through 9 sections explain the flow in smaller pieces. Not every step includes a code snippet, and the snippets are not cumulative. To run the full workflow end to end, use the complete script at the end of this tutorial.

index.ts

index.py
const walletSet = await circleClient.createWalletSet({
  name: "ERC8183 Job Wallets",
});

const walletsResponse = await circleClient.createWallets({
  blockchains: ["ARC-TESTNET"],
  count: 2,
  walletSetId: walletSet.data?.walletSet?.id ?? "",
  accountType: "SCA",
});

const clientWallet = walletsResponse.data?.wallets?.[0]!;
const providerWallet = walletsResponse.data?.wallets?.[1]!;

console.log(`Client:   ${clientWallet.address} (${clientWallet.id})`);
console.log(`Provider: ${providerWallet.address} (${providerWallet.id})`);
console.log(`Evaluator: ${clientWallet.address} (${clientWallet.id})`);
​
Step 3. Fund the client wallet
The script will pause to allow you to fund the client wallet with Arc Testnet USDC from one of these faucets:
Circle Faucet
Circle Console Faucet
You only fund the client wallet as the script transfers starter USDC to the provider wallet automatically before the ERC-8183 flow begins.
The public faucet is rate-limited, so this quickstart avoids requiring a second faucet request for the provider wallet.
​
Step 4. Create the job
Call createJob(provider, evaluator, expiredAt, description, hook) on the deployed ERC-8183 reference implementation. This creates the job in the Open state. This quickstart uses address(0) for hook so the flow stays on the default non-hooked path.

index.ts

index.py
const createJobTx = await circleClient.createContractExecutionTransaction({
  walletAddress: clientWallet.address!,
  blockchain: "ARC-TESTNET",
  contractAddress: AGENTIC_COMMERCE_CONTRACT,
  abiFunctionSignature: "createJob(address,address,uint256,string,address)",
  abiParameters: [
    providerWallet.address!,
    clientWallet.address!,
    expiredAt.toString(),
    "ERC-8183 demo job on Arc Testnet",
    "0x0000000000000000000000000000000000000000",
  ],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
​
Step 5. Set the budget
In this deployed contract, the provider sets the job price by calling setBudget(jobId, amount, optParams).

index.ts

index.py
const setBudgetTx = await circleClient.createContractExecutionTransaction({
  walletAddress: providerWallet.address!,
  blockchain: "ARC-TESTNET",
  contractAddress: AGENTIC_COMMERCE_CONTRACT,
  abiFunctionSignature: "setBudget(uint256,uint256,bytes)",
  abiParameters: [jobId.toString(), JOB_BUDGET.toString(), "0x"],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
​
Step 6. Approve USDC and fund escrow
Before the client can fund the job, the USDC contract must approve the ERC-8183 contract to transfer the escrow amount. Then the client calls fund(jobId, optParams) to move the job into the Funded state.

index.ts

index.py
const approveTx = await circleClient.createContractExecutionTransaction({
  walletAddress: clientWallet.address!,
  blockchain: "ARC-TESTNET",
  contractAddress: "0x3600000000000000000000000000000000000000",
  abiFunctionSignature: "approve(address,uint256)",
  abiParameters: [AGENTIC_COMMERCE_CONTRACT, JOB_BUDGET.toString()],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});

const fundTx = await circleClient.createContractExecutionTransaction({
  walletAddress: clientWallet.address!,
  blockchain: "ARC-TESTNET",
  contractAddress: AGENTIC_COMMERCE_CONTRACT,
  abiFunctionSignature: "fund(uint256,bytes)",
  abiParameters: [jobId.toString(), "0x"],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
​
Step 7. Submit the deliverable
The provider submits a bytes32 deliverable hash, moving the job into the Submitted state.

index.ts

index.py
const deliverableHash = keccak256(toHex("arc-erc8183-demo-deliverable"));

const submitTx = await circleClient.createContractExecutionTransaction({
  walletAddress: providerWallet.address!,
  blockchain: "ARC-TESTNET",
  contractAddress: AGENTIC_COMMERCE_CONTRACT,
  abiFunctionSignature: "submit(uint256,bytes32,bytes)",
  abiParameters: [jobId.toString(), deliverableHash, "0x"],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
​
Step 8. Complete the job
The evaluator completes the job by calling complete(jobId, reason, optParams). In this quickstart, the client is also the evaluator.

index.ts

index.py
const reasonHash = keccak256(toHex("deliverable-approved"));

const completeTx = await circleClient.createContractExecutionTransaction({
  walletAddress: clientWallet.address!,
  blockchain: "ARC-TESTNET",
  contractAddress: AGENTIC_COMMERCE_CONTRACT,
  abiFunctionSignature: "complete(uint256,bytes32,bytes)",
  abiParameters: [jobId.toString(), reasonHash, "0x"],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
​
Step 9. Check the final job state
Read the job back from the contract to confirm it reached Completed. This reference implementation does not return the deliverable in getJob(), so the script prints the submitted deliverable hash from local flow state instead.

index.ts

index.py
const job = await publicClient.readContract({
  address: AGENTIC_COMMERCE_CONTRACT,
  abi: agenticCommerceAbi,
  functionName: "getJob",
  args: [jobId],
});

console.log(`Job ID: ${jobId}`);
console.log(`Status: ${STATUS_NAMES[Number(job.status)]}`);
console.log(`Budget: ${formatUnits(job.budget, 6)} USDC`);
console.log(`Hook: ${job.hook}`);
console.log(`Deliverable hash submitted: ${deliverableHash}`);
​
Full job lifecycle script
These complete scripts below combines all the preceding steps into a single runnable file.

index.ts

index.py
import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";
import { stdin as input, stdout as output } from "node:process";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import {
  createPublicClient,
  decodeEventLog,
  formatUnits,
  http,
  keccak256,
  parseUnits,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { arcTestnet } from "viem/chains";

// To bootstrap provider wallet during setup (see Step 3)
const PROVIDER_STARTER_BALANCE = "1";

const AGENTIC_COMMERCE_CONTRACT =
  "0x0747EEf0706327138c69792bF28Cd525089e4583" as Address;
const JOB_BUDGET = parseUnits("5", 6); // 5 USDC (ERC-20, 6 decimals)

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

const agenticCommerceAbi = [
  {
    type: "function",
    name: "createJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "expiredAt", type: "uint256" },
      { name: "description", type: "string" },
      { name: "hook", type: "address" },
    ],
    outputs: [{ name: "jobId", type: "uint256" }],
  },
  {
    type: "function",
    name: "setBudget",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "fund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "deliverable", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "complete",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "reason", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getJob",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "client", type: "address" },
          { name: "provider", type: "address" },
          { name: "evaluator", type: "address" },
          { name: "description", type: "string" },
          { name: "budget", type: "uint256" },
          { name: "expiredAt", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "hook", type: "address" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "JobCreated",
    inputs: [
      { indexed: true, name: "jobId", type: "uint256" },
      { indexed: true, name: "client", type: "address" },
      { indexed: true, name: "provider", type: "address" },
      { indexed: false, name: "evaluator", type: "address" },
      { indexed: false, name: "expiredAt", type: "uint256" },
      { indexed: false, name: "hook", type: "address" },
    ],
    anonymous: false,
  },
] as const;

const STATUS_NAMES = [
  "Open",
  "Funded",
  "Submitted",
  "Completed",
  "Rejected",
  "Expired",
];

function extractJobId(txHash: Hex) {
  return publicClient
    .getTransactionReceipt({ hash: txHash })
    .then((receipt) => {
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: agenticCommerceAbi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "JobCreated") {
            return decoded.args.jobId;
          }
        } catch {
          continue;
        }
      }
      throw new Error("Could not parse JobCreated event");
    });
}

async function waitForTransaction(txId: string, label: string) {
  process.stdout.write(`  Waiting for ${label}`);
  for (let i = 0; i < 60; i++) {
    await delay(2000);
    const tx = await circleClient.getTransaction({ id: txId });
    const data = tx.data?.transaction;

    if (data?.state === "COMPLETE" && data.txHash) {
      const txHash = data.txHash;
      console.log(
        ` ✓\n  Tx: ${arcTestnet.blockExplorers.default.url}/tx/${txHash}`,
      );
      return txHash as Hex;
    }
    if (data?.state === "FAILED") {
      throw new Error(`${label} failed onchain`);
    }
    process.stdout.write(".");
  }
  throw new Error(`${label} timed out`);
}

async function printBalances(
  title: string,
  wallets: Array<{ label: string; id?: string; address?: string | null }>,
) {
  console.log(`\n${title}:`);

  for (const wallet of wallets) {
    const balances = await circleClient.getWalletTokenBalance({
      id: wallet.id!,
    });
    const usdc = balances.data?.tokenBalances?.find(
      (b) => b.token?.symbol === "USDC",
    );
    console.log(`  ${wallet.label}: ${wallet.address}`);
    console.log(`    USDC: ${usdc?.amount ?? "0"}`);
  }
}

async function main() {
  console.log("── Step 1: Create wallets ──");

  const walletSet = await circleClient.createWalletSet({
    name: "ERC8183 Job Wallets",
  });

  const walletsResponse = await circleClient.createWallets({
    blockchains: ["ARC-TESTNET"],
    count: 2,
    walletSetId: walletSet.data?.walletSet?.id ?? "",
    accountType: "SCA",
  });

  const clientWallet = walletsResponse.data?.wallets?.[0]!;
  const providerWallet = walletsResponse.data?.wallets?.[1]!;

  console.log("\n── Step 2: Fund the client wallet ──");
  console.log("  Fund this wallet with Arc Testnet USDC:");
  console.log(`  Client: ${clientWallet.address}`);
  console.log(`  Wallet ID: ${clientWallet.id}`);
  console.log("  Public faucet:  https://faucet.circle.com");
  console.log("  Console faucet: https://console.circle.com/faucet");
  console.log("\n  This script will fund the provider wallet automatically.");

  const rl = createInterface({ input, output });
  await rl.question("\nPress Enter after the client wallet is funded... ");
  rl.close();

  console.log("\n── Step 3: Transfer starter USDC to provider ──");
  const transferTx = await circleClient.createTransaction({
    walletAddress: clientWallet.address!,
    blockchain: "ARC-TESTNET",
    tokenAddress: "0x3600000000000000000000000000000000000000",
    destinationAddress: providerWallet.address!,
    amount: [PROVIDER_STARTER_BALANCE],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  await waitForTransaction(
    transferTx.data?.id!,
    "transfer starter USDC to provider",
  );

  console.log("\n── Step 4: Check balances ──");
  await printBalances("Balances", [
    { label: "Client", ...clientWallet },
    { label: "Provider", ...providerWallet },
  ]);

  const now = await publicClient.getBlock();
  const expiredAt = now.timestamp + 3600n;

  console.log("\n── Step 5: Create job - createJob() ──");
  const createJobTx = await circleClient.createContractExecutionTransaction({
    walletAddress: clientWallet.address!,
    blockchain: "ARC-TESTNET",
    contractAddress: AGENTIC_COMMERCE_CONTRACT,
    abiFunctionSignature: "createJob(address,address,uint256,string,address)",
    abiParameters: [
      providerWallet.address!,
      clientWallet.address!,
      expiredAt.toString(),
      "ERC-8183 demo job on Arc Testnet",
      "0x0000000000000000000000000000000000000000",
    ],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const createJobTxHash = await waitForTransaction(
    createJobTx.data?.id!,
    "create job",
  );
  const jobId = await extractJobId(createJobTxHash);
  console.log(`  Job ID: ${jobId}`);

  console.log("\n── Step 6: Set budget - setBudget() ──");
  const setBudgetTx = await circleClient.createContractExecutionTransaction({
    walletAddress: providerWallet.address!,
    blockchain: "ARC-TESTNET",
    contractAddress: AGENTIC_COMMERCE_CONTRACT,
    abiFunctionSignature: "setBudget(uint256,uint256,bytes)",
    abiParameters: [jobId.toString(), JOB_BUDGET.toString(), "0x"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  await waitForTransaction(setBudgetTx.data?.id!, "set budget");

  console.log("\n── Step 7: Approve USDC - approve() ──");
  const approveTx = await circleClient.createContractExecutionTransaction({
    walletAddress: clientWallet.address!,
    blockchain: "ARC-TESTNET",
    contractAddress: "0x3600000000000000000000000000000000000000",
    abiFunctionSignature: "approve(address,uint256)",
    abiParameters: [AGENTIC_COMMERCE_CONTRACT, JOB_BUDGET.toString()],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  await waitForTransaction(approveTx.data?.id!, "approve USDC");

  console.log("\n── Step 8: Fund escrow - fund() ──");
  const fundTx = await circleClient.createContractExecutionTransaction({
    walletAddress: clientWallet.address!,
    blockchain: "ARC-TESTNET",
    contractAddress: AGENTIC_COMMERCE_CONTRACT,
    abiFunctionSignature: "fund(uint256,bytes)",
    abiParameters: [jobId.toString(), "0x"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  await waitForTransaction(fundTx.data?.id!, "fund escrow");

  console.log("\n── Step 9: Submit deliverable - submit() ──");
  const deliverableHash = keccak256(toHex("arc-erc8183-demo-deliverable"));
  const submitTx = await circleClient.createContractExecutionTransaction({
    walletAddress: providerWallet.address!,
    blockchain: "ARC-TESTNET",
    contractAddress: AGENTIC_COMMERCE_CONTRACT,
    abiFunctionSignature: "submit(uint256,bytes32,bytes)",
    abiParameters: [jobId.toString(), deliverableHash, "0x"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  await waitForTransaction(submitTx.data?.id!, "submit deliverable");

  console.log("\n── Step 10: Complete job - complete() ──");
  const reasonHash = keccak256(toHex("deliverable-approved"));
  const completeTx = await circleClient.createContractExecutionTransaction({
    walletAddress: clientWallet.address!,
    blockchain: "ARC-TESTNET",
    contractAddress: AGENTIC_COMMERCE_CONTRACT,
    abiFunctionSignature: "complete(uint256,bytes32,bytes)",
    abiParameters: [jobId.toString(), reasonHash, "0x"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  await waitForTransaction(completeTx.data?.id!, "complete job");

  console.log("\n── Step 11: Check final job state ──");
  const job = await publicClient.readContract({
    address: AGENTIC_COMMERCE_CONTRACT,
    abi: agenticCommerceAbi,
    functionName: "getJob",
    args: [jobId],
  });
  console.log(`  Job ID: ${jobId}`);
  console.log(`  Status: ${STATUS_NAMES[Number(job.status)]}`);
  console.log(`  Budget: ${formatUnits(job.budget, 6)} USDC`);
  console.log(`  Hook: ${job.hook}`);
  console.log(`  Deliverable hash submitted: ${deliverableHash}`);

  console.log("\n── Step 12: Check final balances ──");
  await printBalances("Balances", [
    { label: "Client", ...clientWallet },
    { label: "Provider", ...providerWallet },
  ]);
}

main().catch((error) => {
  console.error("\nError:", error.message || error);
  process.exit(1);
});
See all 354 lines
Run the script:

Node.js

Python
npm run start
​
Verify the result
If the flow succeeds, the output should show:
a created job ID
a completed final status
the client balance reduced by the funded escrow amount
the provider balance increased after completion
If platform or evaluator fees are configured on the deployed contract, the provider receives the net amount after fees rather than the full job budget.
You can also inspect the transaction links in the terminal output on Arcscan Testnet.
​
Summary
After completing this quickstart, you’ve successfully:
Set up a project for running an ERC-8183 job flow on Arc Testnet
Prepared client and provider wallets for the client, provider, and evaluator roles
Walked through an example ERC-8183 job lifecycle
Confirmed balances and job state in the script output and reviewed transactions on Arcscan Testnet
Register your first AI agent
App Kit

Copy page

Build payment and liquidity workflows across blockchains with App Kit

Documentation Index
Fetch the complete documentation index at: https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.

The Arc App Kit SDK helps you ship multichain payment and liquidity experiences in just a few lines of code. Instead of orchestrating separate, low-level protocol flows for each blockchain or use case, you use one type-safe interface to combine capabilities into a coherent product flow. It works with Viem, Ethers, Solana Web3.js, and Circle Wallets, and you can extend it to support other wallet providers and frameworks.
​
Quick install
To get started quickly, install the core package and the Viem adapter:

npm

yarn
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2 viem
Need a different adapter or standalone packages? See the full installation guide.
​
Core capabilities
Combine and use any of App Kit’s core capabilities in your app.
Bridge
Transfer USDC across blockchains.
Swap
Exchange one token for another on the same blockchain.
Send
Transfer tokens between wallets on the same blockchain.
Unified Balance
Create a chain-abstracted balance and spend it instantly.
​
Key benefits
Simple setup: Get up and running with minimal configuration and a few lines of code.
Application monetization: Collect a custom fee from end users without writing new code.
Flexible configurations: Specify custom RPC endpoints and wallet clients.
Broad compatibility: Works with Viem, Ethers, Solana, and Circle Wallets, integrating smoothly with existing developer workflows.
Protocol abstraction: Build against a single interface over underlying protocols such as Gateway and CCTP.
Composable workflows: Combine multiple capabilities in one product flow without stitching together separate protocol integrations.
​
Quick look
The following examples show how each capability can be integrated with a single method call.
Bridge
Swap
Unified Balance
Send
TypeScript
// Transfer 1.00 USDC from Ethereum to Arc
const result = await kit.bridge({
  from: { adapter: viemAdapter, chain: "Ethereum_Sepolia" },
  to: { adapter: viemAdapter, chain: "Arc_Testnet" },
  amount: "1.00",
});
Ready to start bridging? Follow the quickstart.
Want to combine capabilities? Follow the Swap Tokens Across Chains quickstart to swap and bridge tokens in the same flow.
Agentic economy
InstallationAccount abstraction

Copy page

Account abstraction providers on Arc, offering SDKs, paymasters, and smart wallet infrastructure for building flexible AA flows.

Documentation Index
Fetch the complete documentation index at: https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.

Account abstraction (AA) replaces externally owned accounts (EOAs) with smart contract wallets that support programmable transaction validation, gas sponsorship, and batched operations. Arc supports the ERC-4337 standard, so you can use any compatible bundler, paymaster, or SDK from the providers below.
​
Providers
​
Biconomy
Account abstraction toolkit offering modular smart accounts, paymasters, and bundlers as a service to simplify the user experience.
​
Blockradar
Infrastructure and APIs for smart account management and transaction bundling, enabling scalable AA flows with minimal setup.
​
Circle Wallets
End-to-end platform for creating and managing secure Arc wallets and cryptographic keys. Supports ERC-20, ERC-721, and ERC-1155 standards.
​
Crossmint
Wallet-as-a-service and AA capabilities to onboard users with email or OAuth-based accounts.
​
Dynamic
Identity and wallet orchestration platform with native ERC-4337 support, enabling passkey wallets and flexible signer management.
​
Para
Wallet and authentication suite for fintech and crypto applications, enabling flexible wallet management and transaction signing.
​
Pimlico
Bundler and paymaster infrastructure for ERC-4337 smart accounts, offering sponsored transactions and reliable relay services.
​
Privy
APIs and SDKs for embedded wallets and user authentication. Onboard users with email or social logins while maintaining full control over key management.
​
Thirdweb
Full-stack toolkit with built-in AA support, SDKs, and a managed smart wallet layer.
​
Turnkey
Programmable key infrastructure for embedded wallets, transaction signing, and onchain automation with policy-based controls.
​
Zerodev
Developer SDK for deploying and managing ERC-4337 smart accounts, with built-in session key and bundler support.
Compliance

Copy page

Compliance providers offering analytics, wallet screening, and monitoring tools for Arc applications.

Documentation Index
Fetch the complete documentation index at: https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.

Add regulatory compliance to your Arc application by integrating third-party analytics and screening tools. These vendors provide APIs for anti-money laundering (AML) checks, wallet risk scoring, sanctions screening, and real-time transaction monitoring.
​
Providers
​
Chainalysis
Blockchain data platform offering transaction monitoring, address screening, and investigation tools to support AML, sanctions, and fraud-detection programs.
​
Elliptic
Blockchain analytics and transaction monitoring APIs to identify illicit activity, assess risk exposure, and ensure compliance with AML and sanctions requirements.
​
TRM Labs
Risk intelligence, wallet screening, and real-time monitoring tools to detect fraud, money laundering, and other suspicious behavior across Arc transactions.
Data indexers

Copy page

Data indexers for querying Arc blockchain data through APIs, sub-graphs, and real-time streams.

Documentation Index
Fetch the complete documentation index at: https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.

Data indexers make it easy to query and analyze onchain data from Arc. They provide APIs and SDKs for tracking smart contract events, balances, and historical state changes without running your own indexing infrastructure.
​
Providers
​
Envio
Developer-first indexing framework for event-driven data and GraphQL APIs on Arc.
HyperIndex: Build production-ready APIs from Arc data in minutes.
Stream live blockchain events with minimal latency.
​
Goldsky
Managed subgraph and data pipeline platform for Arc contracts.
Subgraphs: Autoscaling query engine with 99.9%+ uptime and up to 6x faster performance.
Mirror: Stream onchain data to your database with sub-second latency.
​
The Graph
Decentralized indexing protocol for querying Arc’s onchain data through APIs.
Subgraphs: Query smart contract data through multiple independent indexers for redundancy.
Graph Explorer: Discover and reuse subgraphs published by other developers.
​
Thirdweb
Open-source blockchain data tooling.
Insight: Retrieve Arc blockchain data, enrich it with metadata, and transform it using custom logic.

Node providers

Copy page

Node providers for reliable RPC access, transaction submission, and data queries on Arc.

Documentation Index
Fetch the complete documentation index at: https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.

Connect to the Arc network through third-party RPC infrastructure partners listed below. Each provider offers HTTP and WebSocket endpoints for submitting transactions, querying blockchain data, and subscribing to events. You can also use Arc’s public endpoints directly.
Connection type	Public endpoint
HTTP RPC	https://rpc.testnet.arc.network
WebSocket	wss://rpc.testnet.arc.network
Chain ID	5042002
​
Providers
​
Alchemy
Developer platform providing scalable access to EVM networks with enhanced APIs, monitoring, and debugging tools.
​
Blockdaemon
Institutional-grade node provider offering secure and compliant infrastructure for Arc and other EVM chains.
​
dRPC
Decentralized RPC aggregator providing high-speed, load-balanced access to Arc nodes through a multi-provider architecture.
​
QuickNode
High-performance blockchain infrastructure offering global endpoints and APIs for developers.
You can connect directly to Arc’s public RPC endpoint or through any of these infrastructure partners using your preferred SDK or web3 client.
You can also run your own node for independent verification and direct RPC access without third-party dependencies.
racles

Copy page

Oracle providers for bringing external market data and offchain signals into Arc smart contracts.

Documentation Index
Fetch the complete documentation index at: https://docs.arc.io/llms.txt

Use this file to discover all available pages before exploring further.

Connect your Arc smart contracts to real-world data using the oracle providers listed below. They offer price feeds and related infrastructure for DeFi, trading, lending, and other financial applications.
If your application also needs to query historical onchain data, see Data indexers.
​
Providers
​
Chainlink
Decentralized oracle network for bringing market data and other offchain information onchain. Chainlink Data Feeds aggregate multiple data sources and publish secure, widely used feeds for lending, trading, stablecoins, and tokenized assets.
Data Feeds: Access decentralized price feeds for smart contract integrations.
Data Streams: Retrieve low-latency market data delivered through a pull-based model.
Feed Explorer: Browse available feeds and contract addresses across supported networks.
Contract Addresses: Find deployed price feed contract addresses across supported networks.
​
Pyth
Real-time, first-party market data oracle for onchain applications. Pyth provides price feeds across crypto, equities, FX, metals, and more, with pull and push delivery models for different latency and cost requirements.
Price Feeds: Integrate real-time price data into Arc smart contracts.
EVM Contract Addresses: Find deployed contract addresses for EVM-compatible chains.
​
RedStone
Modular oracle network for secure, real-time price feeds and specialized market data. RedStone supports push, pull, and hybrid delivery models, with coverage across crypto assets, LSTs, LRTs, RWAs, tokenized funds, FX, and other custom data feeds for DeFi and institutional applications.
Docs: Learn about RedStone’s oracle architecture and supported integration models.
Pull Model: Inject signed oracle data directly into user transactions for low-latency, gas-efficient integrations.
Push Feeds: View deployed push feed contract addresses.
Pull Feeds: Browse available pull feed configurations and supported assets.
Price Feeds: Browse RedStone’s supported asset coverage and feed types.
​
Stork
Ultra-low-latency oracle protocol for real-time market data. Stork provides fast, pull-based delivery with cryptographic verifiability for DeFi applications that require sub-second pricing.
Docs: Get started with Stork’s oracle integration guides.
EVM Contract Addresses: Find Stork’s deployed contracts on Arc.


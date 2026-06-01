import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('http://5.161.35.78:8545', 42069, { staticNetwork: true });
const USDC_ADDRESS = '0xed38c197b319fdc067f4c3fb58eec1a733a36cf4';

async function main() {
  const currentBlock = await provider.getBlockNumber();
  console.log('Current block:', currentBlock);
  const logs = await provider.getLogs({
    address: USDC_ADDRESS,
    topics: [
      ethers.id('Transfer(address,address,uint256)'),
      null,
      ethers.zeroPadValue('0x401F40dAb92AF983522C7fe1784530eB6C580D5F', 32)
    ],
    fromBlock: 0,
    toBlock: currentBlock
  });
  console.log('Found logs to 0x401F...:', logs.length);
  const abi = ['event Transfer(address indexed from, address indexed to, uint256 value)'];
  const iface = new ethers.Interface(abi);
  for (const log of logs) {
    const parsed = iface.parseLog(log);
    if (parsed) {
      console.log(`Block: ${log.blockNumber}, From: ${parsed.args.from}, To: ${parsed.args.to}, Value: ${ethers.formatUnits(parsed.args.value, 18)}`);
    }
  }
}

main().catch(console.error);

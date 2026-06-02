import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('http://5.161.35.78:8545', 42069, { staticNetwork: true });
const USDC_ADDRESS = '0xed38c197b319fdc067f4c3fb58eec1a733a36cf4';

async function main() {
  const currentBlock = await provider.getBlockNumber();
  console.log('Current block:', currentBlock);
  const logs = await provider.getLogs({
    address: USDC_ADDRESS,
    topics: [ethers.id('Transfer(address,address,uint256)')],
    fromBlock: currentBlock - 100,
    toBlock: currentBlock
  });
  console.log('Found logs:', logs.length);
  const abi = ['event Transfer(address indexed from, address indexed to, uint256 value)'];
  const iface = new ethers.Interface(abi);
  for (let i = 0; i < Math.min(logs.length, 20); i++) {
    const parsed = iface.parseLog(logs[i]);
    if (parsed) {
      console.log(`From: ${parsed.args.from}, To: ${parsed.args.to}, Value: ${ethers.formatUnits(parsed.args.value, 18)}`);
    }
  }
}

main().catch(console.error);

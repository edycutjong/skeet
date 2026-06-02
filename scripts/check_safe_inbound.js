import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('http://5.161.35.78:8545', 42069, { staticNetwork: true });
const USDC_ADDRESS = '0xed38c197b319fdc067f4c3fb58eec1a733a36cf4';
const SAFE_ADDRESS = '0x06b82e068cf1ba5883cd6c866a62391212e18a1d';

async function main() {
  const currentBlock = await provider.getBlockNumber();
  console.log('Current block:', currentBlock);
  const logs = await provider.getLogs({
    address: USDC_ADDRESS,
    topics: [
      ethers.id('Transfer(address,address,uint256)'),
      null,
      ethers.zeroPadValue(SAFE_ADDRESS, 32)
    ],
    fromBlock: currentBlock - 2000,
    toBlock: currentBlock
  });
  console.log('Found logs to Safe:', logs.length);
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

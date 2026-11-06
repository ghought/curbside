// The jokes. Failures are the game's best feature, so they get their own file.

export const FAIL_LINES: Record<string, string[]> = {
  pool: ['Your parcel is now a pool toy.', 'Parcel has gone for a swim. It cannot swim.', 'Water-resistant was a strong word.'],
  road: ['A truck has signed for your parcel.', 'Flattened. Now ships in a slimmer box.', 'Delivered to the road, briefly.'],
  dog: ['Left with Biscuit. He has signed with his teeth.', 'Biscuit has accepted the parcel. And the terms.', 'Good boy. Bad delivery.'],
  roof: ['Left on roof. It is technically on the premises.', 'Parcel is enjoying the view.', 'Customer has been advised to buy a ladder.'],
  tree: ['Left in tree. Awaiting squirrel signature.', 'Your parcel has nested.', 'It lives up there now.'],
  window: ['Customer would like a word.', 'Delivered through the window. Not the good kind.', 'That is a lot of glass for one parcel.'],
  crushed: ['Contents: formerly a parcel.', 'Delivered in several shipments.', 'The packing peanuts did not survive either.'],
  lawn: ['Left on lawn. Customer has to walk now. Customer is furious.', 'Close enough? No. Not close enough.', 'The lawn says thank you.'],
  path: ['Left on the path. Bold.', 'Dropped on the path, like a cat with a mouse.', 'So close the customer can almost see it.'],
  walk: ['Left on the sidewalk. Anyone could have that now.', 'You threw it about as far as a toddler.', 'A great throw, for a smaller street.'],
  neighbour: ['Left with a neighbour. They seem thrilled.', 'Wrong house. Right energy.', 'The neighbour says thanks for the free stuff.'],
  courier: ['You hit yourself. Self-service delivery.', 'Return to sender. Sender is you.', 'Parcel has come home to you. Ow.'],
  hedge: ['Left in hedge. Filed under "nature".', 'The hedge has taken it. The hedge takes everything.'],
  bed: ['Planted. It may grow into a bigger parcel.', 'Left in the flower bed. Customer\'s petunias are upset.'],
  bin: ['Placed in recycling. Honestly, efficient.', 'Straight to the bin. Saves the customer a trip.'],
  binside: ['Clanged off the bin. Very percussive.'],
  car: ['Left on a car. It is the car\'s problem now.', 'That car is now also a delivery address.'],
  van: ['Back in the van. A bold returns policy.', 'You delivered it to yourself. Again.'],
  pergola: ['Left on top of the pergola. Nobody will ever know.'],
  chimney: ['Ho ho ho.'],
  porch: ['So close. On the porch, off the mat.', 'Customer specifically said mat.'],
  mat: ['Half on the mat. Customer is unmoved.'],
  stoop: ['Stuck on the steps. "Close enough", said the last guy.', 'That is a stair, not a stoop.'],
  balcony: ['On the balcony, off the mat. Customer is squinting.'],
  rail: ['Balanced on the rail. Beautiful. Useless.'],
  fence: ['Left on fence. Sitting on the fence is a choice.'],
  house: ['Parked against the house. Could be anyone\'s.'],
  table: ['Wrong table. Table 7 did not order this.'],
  trampoline: ['Left on the trampoline. The kids have it now.'],
  cradle: ['On the cradle, off the mat. Dale cannot reach. He is not trying.'],
  cart: ['On the cart. Wrong end of the cart.'],
  lost: ['Your parcel has left the neighbourhood.', 'Last seen heading north.'],
  wall: ['It lives by the wall now.'],
  glasswall: ['It hit the glass like a confused pigeon.'],
  mailbox: ['Not that kind of mail.'],
  post: ['It wrapped around the post, somehow.'],
  awning: ['It is resting on the awning. Luigi is annoyed.'],
};

const FALLBACK = ['That is not the mat.', 'Customer is watching. Customer is sighing.'];

export function failLine(reason: string, salt: number): string {
  const lines = FAIL_LINES[reason] ?? FALLBACK;
  return lines[Math.abs(salt) % lines.length];
}

export const FAIL_STAMP: Record<string, string> = {
  pool: 'SOGGY', road: 'RUN OVER', dog: 'STOLEN', window: 'SMASHED', crushed: 'CRUSHED', courier: 'OW', tree: 'STUCK',
  roof: 'ON ROOF', neighbour: 'WRONG HOUSE', bin: 'BINNED', lost: 'LOST',
};

export const DONE_LINES = [
  'Customer did not even look up.',
  'Five stars. Possibly a tip.',
  'Signed for. Illegibly.',
  'A flawless crime against parcels.',
];

export const GIVE_UP_LINES = [
  'Customer has requested a different courier.',
  'Parcel returned to depot, in spirit.',
  'A card has been left. It says "sorry".',
];

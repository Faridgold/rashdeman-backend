const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_FILE = './data.json';
const PORT = 3001;

// خواندن داده‌ها از فایل
async function readData() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading data:', error.message);
    return {
      users: [],
      challenges: [],
      invitations: [],
      penalties: [],
      charities: [
        { id: 'charity1', name: 'محک', link: 'https://mahak-charity.org/online-payment/' },
        { id: 'charity2', name: 'کهریزک', link: 'https://kahrizakcharity.com/' }
      ]
    };
  }
}

// نوشتن داده‌ها به فایل
async function writeData(data) {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error writing data:', error.message);
    throw error;
  }
}

// API ثبت‌نام
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  console.log('Register request:', { name, email, password });
  if (!name || !email || !password) {
    console.error('Missing required fields:', { name, email, password });
    return res.status(400).json({ message: 'نام، ایمیل و رمز عبور الزامی است' });
  }
  try {
    let data = await readData();
    if (data.users.find(u => u.email === email)) {
      console.error('Email already exists:', email);
      return res.status(400).json({ message: 'ایمیل قبلاً ثبت شده' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = { id: uuidv4(), name, email, password: hashedPassword };
    data.users.push(user);
    await writeData(data);
    console.log('User registered:', { id: user.id, name, email });
    res.json({ user: { id: user.id, name, email }, message: 'ثبت‌نام موفقیت‌آمیز' });
  } catch (error) {
    console.error('Register error:', error.message);
    res.status(500).json({ message: 'خطا در سرور هنگام ثبت‌نام' });
  }
});

// API ورود
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('Login request:', { email });
  if (!email || !password) {
    console.error('Missing email or password:', { email, password });
    return res.status(400).json({ message: 'ایمیل و رمز عبور الزامی است' });
  }
  try {
    let data = await readData();
    const user = data.users.find(u => u.email === email);
    if (!user) {
      console.error('User not found:', email);
      return res.status(401).json({ message: 'ایمیل یا رمز عبور اشتباه است' });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      console.error('Incorrect password for:', email);
      return res.status(401).json({ message: 'ایمیل یا رمز عبور اشتباه است' });
    }
    console.log('User logged in:', { id: user.id, name: user.name, email });
    res.json({ user: { id: user.id, name: user.name, email: user.email }, message: 'ورود موفقیت‌آمیز' });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'خطا در سرور هنگام ورود' });
  }
});

// API ایجاد چالش
app.post('/challenges', async (req, res) => {
  const { userId, title, description, duration, penalty, charityId } = req.body;
  console.log('Create challenge request:', { userId, title, duration, penalty, charityId });
  if (!userId || !title || !duration || !penalty || !charityId) {
    console.error('Missing required fields for challenge:', { userId, title, duration, penalty, charityId });
    return res.status(400).json({ message: 'همه فیلدها الزامی است' });
  }
  try {
    const data = await readData();
    const challenge = {
      id: uuidv4(),
      userId,
      title,
      description: description || '',
      duration: parseInt(duration),
      penalty: parseInt(penalty),
      charityId,
      progress: 0,
      totalPenalty: 0,
      witnesses: [],
      createdAt: new Date().toISOString()
    };
    data.challenges.push(challenge);
    await writeData(data);
    console.log('Challenge created:', challenge);
    res.json({ challenge, message: 'چالش ایجاد شد' });
  } catch (error) {
    console.error('Error creating challenge:', error.message);
    res.status(500).json({ message: 'خطا در ایجاد چالش' });
  }
});

// API ثبت جریمه
app.post('/challenges/:id/penalties', async (req, res) => {
  const { id } = req.params;
  const { recordedBy } = req.body;
  console.log('Add penalty request:', { challengeId: id, recordedBy });
  try {
    const data = await readData();
    const challenge = data.challenges.find(c => c.id === id);
    if (!challenge) {
      console.error('Challenge not found:', id);
      return res.status(404).json({ message: 'چالش یافت نشد' });
    }
    if (challenge.userId !== recordedBy && !challenge.witnesses.includes(recordedBy)) {
      console.error('Unauthorized to add penalty:', { recordedBy, challenge });
      return res.status(403).json({ message: 'فقط مالک چالش یا شاهد می‌تواند جریمه ثبت کند' });
    }
    challenge.progress = Math.min(challenge.progress + 1, challenge.duration);
    challenge.totalPenalty += challenge.penalty;
    const penalty = {
      id: uuidv4(),
      challengeId: id,
      date: new Date().toISOString(),
      amount: challenge.penalty,
      recordedBy: recordedBy || challenge.userId
    };
    data.penalties.push(penalty);
    await writeData(data);
    console.log('Penalty added:', penalty);
    res.json({ challenge, penalty, message: 'جریمه ثبت شد' });
  } catch (error) {
    console.error('Error adding penalty:', error.message);
    res.status(500).json({ message: 'خطا در ثبت جریمه' });
  }
});

// API تأیید پرداخت و صفر کردن جریمه‌ها
app.post('/challenges/:id/confirm-payment', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  console.log('Confirm payment request:', { challengeId: id, userId });
  try {
    const data = await readData();
    const challenge = data.challenges.find(c => c.id === id && c.userId === userId);
    if (!challenge) {
      console.error('Challenge not found or unauthorized:', { id, userId });
      return res.status(404).json({ message: 'چالش یافت نشد یا دسترسی ندارید' });
    }
    challenge.totalPenalty = 0;
    challenge.progress = 0;
    data.penalties = data.penalties.filter(p => p.challengeId !== id);
    await writeData(data);
    console.log('Payment confirmed, penalties reset:', challenge);
    res.json({ challenge, message: 'پرداخت تأیید شد و جریمه‌ها صفر شدند' });
  } catch (error) {
    console.error('Error confirming payment:', error.message);
    res.status(500).json({ message: 'خطا در تأیید پرداخت' });
  }
});

// API اضافه کردن شاهد
app.post('/challenges/:id/witnesses', async (req, res) => {
  const { id } = req.params;
  const { witnessId } = req.body;
  console.log('Add witness request:', { challengeId: id, witnessId });
  try {
    const data = await readData();
    const challenge = data.challenges.find(c => c.id === id);
    if (!challenge) {
      console.error('Challenge not found:', id);
      return res.status(404).json({ message: 'چالش یافت نشد' });
    }
    if (!data.users.find(u => u.id === witnessId)) {
      console.error('Witness not found:', witnessId);
      return res.status(404).json({ message: 'کاربر شاهد یافت نشد' });
    }
    if (!challenge.witnesses.includes(witnessId)) {
      challenge.witnesses.push(witnessId);
    }
    await writeData(data);
    console.log('Witness added:', { challengeId: id, witnessId });
    res.json({ challenge, message: 'شاهد اضافه شد' });
  } catch (error) {
    console.error('Error adding witness:', error.message);
    res.status(500).json({ message: 'خطا در اضافه کردن شاهد' });
  }
});

// API گرفتن چالش‌های کاربر
app.get('/challenges/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log('Fetch challenges for user:', userId);
  try {
    const data = await readData();
    const challenges = data.challenges.filter(c => c.userId === userId || c.witnesses.includes(userId));
    res.json(challenges);
  } catch (error) {
    console.error('Error fetching challenges:', error.message);
    res.status(500).json({ message: 'خطا در گرفتن چالش‌ها' });
  }
});

// API گرفتن تاریخچه جریمه‌ها
app.get('/challenges/:id/penalties', async (req, res) => {
  const { id } = req.params;
  console.log('Fetch penalties for challenge:', id);
  try {
    const data = await readData();
    const penalties = data.penalties.filter(p => p.challengeId === id);
    res.json(penalties);
  } catch (error) {
    console.error('Error fetching penalties:', error.message);
    res.status(500).json({ message: 'خطا در گرفتن جریمه‌ها' });
  }
});

// API آمار پروفایل
app.get('/profile/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log('Fetch profile for user:', userId);
  try {
    const data = await readData();
    const userChallenges = data.challenges.filter(c => c.userId === userId);
    const userPenalties = data.penalties.filter(p => userChallenges.some(c => c.id === p.challengeId));
    const stats = {
      totalChallenges: userChallenges.length,
      activeChallenges: userChallenges.filter(c => c.progress < c.duration).length,
      completedChallenges: userChallenges.filter(c => c.progress >= c.duration).length,
      totalPenalties: userChallenges.reduce((sum, c) => sum + c.totalPenalty, 0)
    };
    res.json({ stats, message: 'آمار پروفایل' });
  } catch (error) {
    console.error('Error fetching profile:', error.message);
    res.status(500).json({ message: 'خطا در گرفتن آمار پروفایل' });
  }
});

// API آمار هفتگی
app.get('/statistics/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log('Fetch weekly stats for user:', userId);
  try {
    const data = await readData();
    const userChallenges = data.challenges.filter(c => c.userId === userId);
    const penalties = data.penalties.filter(p => userChallenges.some(c => c.id === p.challengeId));
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const weeklyPenalties = penalties.filter(p => new Date(p.date) >= sevenDaysAgo);
    const stats = {
      weeklyCount: weeklyPenalties.length,
      weeklyTotalPenalty: weeklyPenalties.reduce((sum, p) => sum + p.amount, 0),
      dailyBreakdown: Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateString = date.toISOString().split('T')[0];
        return {
          date: dateString,
          count: penalties.filter(p => p.date.includes(dateString)).length,
          amount: penalties.filter(p => p.date.includes(dateString)).reduce((sum, p) => sum + p.amount, 0)
        };
      }).reverse()
    };
    res.json({ stats, message: 'آمار هفتگی' });
  } catch (error) {
    console.error('Error fetching weekly stats:', error.message);
    res.status(500).json({ message: 'خطا در گرفتن آمار هفتگی' });
  }
});

// API گرفتن خیریه‌ها
app.get('/charities', async (req, res) => {
  console.log('Fetch charities');
  try {
    const data = await readData();
    res.json(data.charities);
  } catch (error) {
    console.error('Error fetching charities:', error.message);
    res.status(500).json({ message: 'خطا در گرفتن خیریه‌ها' });
  }
});

// API دعوت دوستان
app.post('/invitations', async (req, res) => {
  const { fromUserId, toUserId, challengeId } = req.body;
  console.log('Invite friend request:', { fromUserId, toUserId, challengeId });
  if (!fromUserId || !toUserId || !challengeId) {
    console.error('Missing required fields for invitation:', { fromUserId, toUserId, challengeId });
    return res.status(400).json({ message: 'همه فیلدها الزامی است' });
  }
  try {
    const data = await readData();
    const fromUser = data.users.find(u => u.id === fromUserId);
    const toUser = data.users.find(u => u.id === toUserId);
    const challenge = data.challenges.find(c => c.id === challengeId);
    if (!fromUser || !toUser || !challenge) {
      console.error('User or challenge not found:', { fromUserId, toUserId, challengeId });
      return res.status(404).json({ message: 'کاربر یا چالش یافت نشد' });
    }
    const invitation = {
      id: uuidv4(),
      fromUserId,
      toUserId,
      challengeId,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    data.invitations.push(invitation);
    await writeData(data);
    console.log('Invitation sent:', invitation);
    res.json({ invitation, message: 'دعوت‌نامه ارسال شد' });
  } catch (error) {
    console.error('Error sending invitation:', error.message);
    res.status(500).json({ message: 'خطا در ارسال دعوت‌نامه' });
  }
});

// API گرفتن دعوت‌نامه‌های کاربر
app.get('/invitations/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log('Fetch invitations for user:', userId);
  try {
    const data = await readData();
    const invitations = data.invitations.filter(i => i.toUserId === userId);
    res.json(invitations);
  } catch (error) {
    console.error('Error fetching invitations:', error.message);
    res.status(500).json({ message: 'خطا در گرفتن دعوت‌نامه‌ها' });
  }
});

app.listen(PORT, () => {
  console.log(`سرور رشدمن در حال اجرا روی پورت ${PORT}`);
});
<script setup lang="ts">
import { ref } from 'vue'
import UiIcon from './common/UiIcon.vue'
import { useSimulator } from '../state/simulator'

const { login, notify } = useSimulator()
const studentId = ref(''), name = ref(''), studentMode = ref(false)
function enterStudent() {
  if (!name.value.trim()) { notify('请输入学员姓名。', 'warning'); return }
  if (!/^\d{17}[\dXx]$/.test(studentId.value.trim())) { notify('请输入 18 位身份证号。', 'warning'); return }
  login('student', name.value)
}
</script>

<template>
  <div class="login-page">
    <header class="login-masthead"><img src="/simulator-web/assets/branding/fengmian.png" alt="甲醇燃料模拟器标志" /><span>SIMULATOR<span class="masthead-divider">/</span><small>WEB EDITION</small></span></header>
    <div class="ocean-lines" aria-hidden="true"><svg viewBox="0 0 1600 300" preserveAspectRatio="none"><path d="M0 170 Q200 30 400 170 T800 170 T1200 170 T1600 170" /><path d="M0 205 Q200 65 400 205 T800 205 T1200 205 T1600 205" /><path d="M0 240 Q200 100 400 240 T800 240 T1200 240 T1600 240" /></svg></div>
    <main class="login-window">
      <section class="login-brand">
        <div class="brand-grid" aria-hidden="true" />
        <div class="brand-content"><div class="brand-logo"><img src="/simulator-web/assets/branding/fengmian.png" alt="模拟器" /></div><h1>甲醇燃料<br />模拟器软件</h1><p>METHANOL FUEL SIMULATOR</p><div class="brand-rule" /><div class="brand-feature"><UiIcon name="Workflow" />全流程工艺仿真</div><div class="brand-feature"><UiIcon name="ShieldCheck" />作业安全与异常处置</div><div class="brand-feature"><UiIcon name="GraduationCap" />教学 · 练习 · 考核</div></div>
        <span class="brand-version">METHANOL FUEL SIMULATOR</span>
      </section>
      <section class="login-form">
        <div class="login-title"><span>SYSTEM ACCESS</span><h2>系统登录</h2><p>欢迎进入甲醇燃料仿真训练平台</p></div>
        <div class="role-switch"><button :class="{ active: !studentMode }" @click="studentMode = false"><UiIcon name="Users" :size="17" />教师 / 离线演示</button><button :class="{ active: studentMode }" @click="studentMode = true"><UiIcon name="GraduationCap" :size="17" />学员登录</button></div>
        <form v-if="studentMode" class="student-form" @submit.prevent="enterStudent">
          <label class="field-group"><span>身份证号</span><input v-model="studentId" class="field" autocomplete="off" placeholder="请输入 18 位身份证号" maxlength="18" /></label>
          <label class="field-group"><span>姓名</span><input v-model="name" class="field" autocomplete="off" placeholder="请输入学员姓名" maxlength="30" /></label>
          <button class="btn btn-primary enter-button" type="submit">登录学员界面<UiIcon name="ArrowRight" :size="18" /></button>
          <button type="button" class="sample-login" @click="login('student', '演示学员')">无需填写信息，体验演示学员</button>
        </form>
        <div v-else class="teacher-actions"><div class="teacher-note"><UiIcon name="Monitor" :size="28" /><div><strong>教师工作站</strong><p>直接进入，查看工艺系统与教学管理界面</p></div></div><button class="btn btn-primary enter-button" data-testid="enter-teacher" @click="login('teacher')">进入教师界面<UiIcon name="ArrowRight" :size="18" /></button><button class="btn offline-button" @click="login('offline')"><UiIcon name="Play" :size="17" />离线仿真演示</button></div>
        <div class="local-note"><UiIcon name="Info" :size="15" /><span>本地模式不回传实验数据。实验空间用户请从课程页进入。</span></div>
      </section>
    </main>
    <footer class="login-footer"><span>甲醇燃料系统 · 仿真教学与安全训练</span><span></span></footer>
  </div>
</template>

<style scoped>
.login-page{min-height:100dvh;background:radial-gradient(ellipse at 70% 20%,#154d7b 0,#0c3153 48%,#08233d 100%);position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:100px 24px 76px;color:#fff}
.login-masthead{position:absolute;top:30px;left:42px;right:42px;display:flex;align-items:center;gap:13px;font-size:18px;letter-spacing:3px}.login-masthead>img{width:35px;height:35px;border-radius:7px}.login-masthead small{font-size:11px;letter-spacing:2px;color:#9ab9d5}.masthead-divider{color:#5e87aa;margin:0 12px}.preview-badge{margin-left:auto;font-size:11px;letter-spacing:0;color:#b8d2e9;display:flex;align-items:center;gap:9px}
.login-window{width:850px;min-height:485px;max-width:100%;position:relative;display:grid;grid-template-columns:310px 1fr;background:#d8effd;border:1px solid #8eb8d2;border-radius:13px;box-shadow:0 35px 100px #02142480;overflow:hidden;z-index:1}
.login-brand{position:relative;background:linear-gradient(135deg,#0b4d92,#073c70);padding:44px 35px 32px;display:flex;flex-direction:column;justify-content:space-between}.brand-grid{position:absolute;inset:0;opacity:.09;background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);background-size:28px 28px}.brand-content{position:relative}.brand-logo{width:79px;height:79px;background:#f4f7fb;border-radius:15px;padding:9px;margin-bottom:24px;box-shadow:0 5px 20px #021c3733}.brand-logo img{width:100%;height:100%;object-fit:cover;border-radius:7px}.login-brand h1{font-size:29px;line-height:1.5;font-weight:500;letter-spacing:3px;margin-bottom:8px}.brand-content>p{font-size:8px;letter-spacing:1.5px;color:#9dbddd}.brand-rule{height:1px;width:35px;background:#62b7e5;margin:24px 0}.brand-feature{font-size:12px;color:#c0daed;display:flex;gap:10px;align-items:center;margin-top:14px}.brand-version{font-size:8px;letter-spacing:2px;color:#91b0cf;margin-top:35px;position:relative}
.login-form{padding:43px 48px 28px;color:#17334e;background:linear-gradient(145deg,#d8effd,#b5dcf3)}.login-title>span{font-size:9px;letter-spacing:3px;color:#6891b1}.login-title h2{font-size:31px;font-weight:600;margin:6px 0 8px}.login-title p{font-size:12px;color:#5c7b95;margin-bottom:25px}.role-switch{display:flex;border-bottom:1px solid #99bfd9;margin-bottom:27px}.role-switch button{flex:1;padding:10px 0;display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-bottom:3px solid transparent;background:none;color:#62849e;font-size:12px}.role-switch button.active{color:#0b4d92;border-bottom-color:#0b4d92;font-weight:600}.teacher-note{display:flex;gap:14px;align-items:center;margin:4px 0 30px;color:#1c659d}.teacher-note strong{font-size:15px;font-weight:600}.teacher-note p{margin:6px 0 0;color:#62819a;font-size:11px}.enter-button{width:100%;height:41px;justify-content:space-between;padding:10px 18px;font-size:14px}.offline-button{margin-top:12px;width:100%;background:#e5f4fd;border-color:#8fbad9;color:#215d8b;height:39px}.local-note{display:flex;align-items:flex-start;gap:6px;color:#6588a3;font-size:10px;line-height:1.6;margin-top:26px}.student-form{display:flex;flex-direction:column;gap:15px}.student-form .field-group{font-size:12px}.sample-login{color:#3f7fac;text-align:center;border:0;background:transparent;font-size:11px;padding:4px}
.ocean-lines{position:absolute;bottom:-30px;left:0;right:0;opacity:.13;height:300px}.ocean-lines svg{height:100%;width:100%;fill:none;stroke:#83c5ee;stroke-width:1}.login-footer{position:absolute;bottom:28px;left:42px;right:42px;display:flex;justify-content:space-between;font-size:10px;color:#6f99bb;letter-spacing:1px}
@media(max-width:760px){.login-window{grid-template-columns:230px 1fr}.login-brand{padding:35px 25px}.login-form{padding:35px 26px}.login-brand h1{font-size:24px}.login-masthead{left:24px;right:24px}.preview-badge{display:none}}
@media(max-width:560px){.login-page{padding:85px 16px 65px}.login-window{display:block;min-height:0}.login-brand{display:none}.login-form{padding:32px 25px}.login-masthead{top:25px;font-size:15px}.login-footer{left:20px;right:20px}.login-footer>span:last-child{display:none}}
</style>

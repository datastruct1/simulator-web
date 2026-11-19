<script setup lang="ts">
import { computed } from 'vue'
import {
  Activity, Anchor, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bell, BellOff, BookOpen, BriefcaseMedical,
  Bug, CalendarDays, ChartNoAxesCombined, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight,
  ChevronUp, Circle, CircleHelp, ClipboardCheck, Clock, Cog, Container, Copy, Download, Edit3, Eye,
  Fan, File, FileCheck, FileJson, FileText, FolderOpen, Fuel, Gauge, GraduationCap, Home, Info,
  LayoutDashboard, ListChecks, LogIn, LogOut, Maximize2, Menu, Minimize2, Minus, Monitor, MoreHorizontal,
  Pause, Play, Plus, Power, RefreshCw, RotateCcw, Save, Search, Settings, ShieldCheck, SlidersHorizontal,
  Square, ScrollText, Thermometer, Timer, Trash2, TriangleAlert, Upload, User, Users, Volume2,
  VolumeX, Wind, Workflow, Wrench, X, ZoomIn, ZoomOut, Recycle, Send, LockKeyhole, CheckCircle2,
} from 'lucide-vue-next'

const props = withDefaults(defineProps<{ name: string; size?: number | string; strokeWidth?: number }>(), { size: 18, strokeWidth: 1.8 })
const icons: Record<string, any> = {
  Activity, Anchor, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bell, BellOff, BookOpen, BriefcaseMedical,
  Bug, CalendarDays, ChartNoAxesCombined, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight,
  ChevronUp, Circle, CircleHelp, ClipboardCheck, Clock, Cog, Container, Copy, Download, Edit3, Eye,
  Fan, File, FileCheck, FileJson, FileText, FolderOpen, Fuel, Gauge, GraduationCap, Home, Info,
  LayoutDashboard, ListChecks, LogIn, LogOut, Maximize2, Menu, Minimize2, Minus, Monitor, MoreHorizontal,
  Pause, Play, Plus, Power, RefreshCw, RotateCcw, Save, Search, Settings, ShieldCheck, SlidersHorizontal,
  Square, ScrollText, Thermometer, Timer, Trash2, TriangleAlert, Upload, User, Users, Volume2,
  VolumeX, Wind, Workflow, Wrench, X, ZoomIn, ZoomOut, Recycle, Send, LockKeyhole, CheckCircle2,
}
const icon = computed(() => icons[props.name] || CircleHelp)
</script>

<template><component :is="icon" :size="size" :stroke-width="strokeWidth" class="ui-icon" aria-hidden="true" /></template>

<style scoped>.ui-icon{flex-shrink:0;vertical-align:middle}</style>

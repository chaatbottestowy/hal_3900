<template>
  <div class="message">
    <HalMessage v-if="message.type === 'simple' && message.from === 'bot' && message.body.substr(0,1) !== '['" :message="message" :text="message.body"></HalMessage>
    <UserMessage v-if="message.type === 'simple' && message.from === 'user'" :message="message"></UserMessage>
    <OptionsMessage v-if="message.type === 'options' && message.body.length > 1" :message="message"></OptionsMessage>
    <HalMessage v-if="message.type === 'options' && message.body.length == 1" :message="message" :text="message.body[0].text"></HalMessage>
    <TableMessage v-if="message.type === 'table'" :table="message.body" :msg="message"></TableMessage>
    <QuizMessage v-if="message.type === 'quiz'" :message="message"></QuizMessage>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'
import { BotResponse, Theme } from './types'
import HalMessage from './messages/HalMessage.vue'
import UserMessage from './messages/UserMessage.vue'
import OptionsMessage from './messages/OptionsMessage.vue'
import TableMessage from './messages/TableMessage.vue'
import QuizMessage from './messages/QuizMessage.vue'

@Component({
  components: {
    QuizMessage,
    HalMessage,
    UserMessage,
    OptionsMessage,
    TableMessage
  }
})
export default class Message extends Vue {
  @Prop() message: any
  mounted () {

  }
}
</script>

<style scoped lang="sass">
.message
  width: 100%
  margin-bottom: 0.5rem
</style>

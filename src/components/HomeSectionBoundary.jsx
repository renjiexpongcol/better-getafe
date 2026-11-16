import { Component } from 'react'
import { Link } from 'react-router-dom'
import { reportClientError } from '../services/publicError'

export default class HomeSectionBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { reportClientError(error, { component: this.props.title }) }
  render() {
    if (!this.state.failed) return this.props.children
    return <section className="section"><div className="container homepage-state" role="status">
      <h2>{this.props.title}</h2><p>This information is temporarily unavailable.</p>
      <button type="button" onClick={() => this.setState({ failed: false })}>Try again</button>{' '}
      <Link to={this.props.to}>View more information</Link>
    </div></section>
  }
}
